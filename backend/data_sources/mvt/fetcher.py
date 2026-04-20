import imaplib
import email
import email.utils
from email.header import decode_header
from email.message import Message
import logging
from typing import List, Dict, Any
from datetime import datetime, timedelta
from backend.core.config import settings
from .parser import parse_mvt_message

logger = logging.getLogger(__name__)

def decode_mime_words(s: str) -> str:
    if not s:
        return ""
    decoded_words = decode_header(s)
    text = ""
    for word, encoding in decoded_words:
        if isinstance(word, bytes):
            text += word.decode(encoding or "utf-8", errors="ignore")
        else:
            text += word
    return text

def get_email_body(msg: Message) -> str:
    """Extracts text/plain body from email."""
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get('Content-Disposition'))
            if content_type == 'text/plain' and 'attachment' not in content_disposition:
                try:
                    charset = part.get_content_charset()
                    payload = part.get_payload(decode=True)
                    if isinstance(payload, bytes):
                        body += payload.decode(charset or 'utf-8', errors='ignore')
                    elif isinstance(payload, str):
                        body += payload
                except Exception as e:
                    logger.error(f"Error decoding MVT email body part: {e}")
    else:
        if msg.get_content_type() == 'text/plain':
            try:
                charset = msg.get_content_charset()
                payload = msg.get_payload(decode=True)
                if isinstance(payload, bytes):
                    body += payload.decode(charset or 'utf-8', errors='ignore')
                elif isinstance(payload, str):
                    body += payload
            except Exception as e:
                logger.error(f"Error decoding MVT email body: {e}")
    return body

def fetch_mvt_emails(last_uid: int = 0, limit: int = 800) -> tuple[List[Dict[str, Any]], int]:
    """Connects to IMAP, searches for MVT emails, parses them."""
    email_user = settings.OFP_EMAIL
    email_pass = settings.OFP_APP_PASSWORD
    
    if not email_pass:
        logger.error("OFP_APP_PASSWORD not set. Cannot fetch MVT.")
        return [], last_uid

    mail = None
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        mail.login(email_user, email_pass)
        
        possible_folders = ['"Flight Watch/MVT"', 'Flight Watch/MVT', '"[Gmail]/Flight Watch/MVT"']
        status = "NO"
        for folder in possible_folders:
            status, _ = mail.select(folder)
            if status == "OK":
                break
        
        if status != "OK":
            mail.select("INBOX")
            search_query = 'X-GM-RAW "label:flight-watch-mvt"'
            if last_uid > 0:
                status, search_data = mail.uid('SEARCH', None, f'{search_query} UID {last_uid + 1}:*')
            else:
                dt = datetime.utcnow() - timedelta(days=2)
                months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                since_date = f"{dt.day:02d}-{months[dt.month - 1]}-{dt.year}"
                status, search_data = mail.uid('SEARCH', None, f'{search_query} SINCE {since_date}')
            
            if status != "OK":
                return [], last_uid
        else:
            if last_uid > 0:
                status, search_data = mail.uid('SEARCH', None, f'UID {last_uid + 1}:*')
            else:
                dt = datetime.utcnow() - timedelta(days=2)
                months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                since_date = f"{dt.day:02d}-{months[dt.month - 1]}-{dt.year}"
                status, search_data = mail.uid('SEARCH', None, f'SINCE {since_date}')
                
            if status != "OK":
                return [], last_uid
                
        email_ids = search_data[0].split()
        if not email_ids:
            return [], last_uid
            
        highest_uid = last_uid
        if last_uid == 0 and len(email_ids) > limit:
            fetch_ids = email_ids[-limit:]
        else:
            fetch_ids = email_ids
            
        results = []
        for e_id in fetch_ids:
            current_uid = int(e_id)
            if last_uid > 0 and current_uid <= last_uid:
                continue
                
            status, msg_data = mail.uid('FETCH', e_id, '(RFC822)')
            if status != "OK":
                continue
                
            if current_uid > highest_uid:
                highest_uid = current_uid
                
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    msg = email.message_from_bytes(response_part[1])
                    subject = decode_mime_words(msg.get("Subject", ""))
                    
                    date_header = msg.get("Date")
                    msg_date_utc = datetime.utcnow()
                    if date_header:
                        try:
                            parsed_date = email.utils.parsedate_to_datetime(date_header)
                            msg_date_utc = parsed_date.astimezone(datetime.timezone.utc).replace(tzinfo=None) if parsed_date.tzinfo else parsed_date
                            if last_uid == 0 and (datetime.utcnow() - msg_date_utc > timedelta(hours=48)):
                                continue
                        except:
                            pass
                            
                    body = get_email_body(msg)
                    if not body.strip():
                        continue
                        
                    parsed_mvt = parse_mvt_message(body, subject, msg_date_utc)
                    if parsed_mvt:
                        parsed_mvt["email_uid"] = current_uid
                        results.append(parsed_mvt)
                        
        return results, highest_uid
    except Exception as e:
        logger.error(f"Error fetching MVT emails: {e}")
        return [], last_uid
    finally:
        if mail:
            try: mail.close()
            except: pass
            try: mail.logout()
            except: pass
