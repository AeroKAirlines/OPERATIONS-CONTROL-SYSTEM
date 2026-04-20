import imaplib
import email
import email.utils
from email.header import decode_header
from email.message import Message
import logging
from typing import List, Dict, Any
from datetime import datetime, timedelta
from backend.core.config import settings
from .parser import parse_acars_message

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
    """
    Extracts the text/plain body from an email message.
    """
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
                    logger.error(f"Error decoding email body part: {e}")
    else:
        content_type = msg.get_content_type()
        if content_type == 'text/plain':
            try:
                charset = msg.get_content_charset()
                payload = msg.get_payload(decode=True)
                if isinstance(payload, bytes):
                    body += payload.decode(charset or 'utf-8', errors='ignore')
                elif isinstance(payload, str):
                    body += payload
            except Exception as e:
                logger.error(f"Error decoding email body: {e}")
                
    return body

def fetch_acars_emails(last_uid: int = 0, limit: int = 400, since_days: int = 0) -> tuple[List[Dict[str, Any]], int]:
    """
    Connects to IMAP, searches for 'Flight Watch/ACARS' labeled emails,
    extracts the body, and parses ACARS messages.
    Returns a tuple: (list of parsed messages, highest UID fetched).
    """
    email_user = settings.OFP_EMAIL
    email_pass = settings.OFP_APP_PASSWORD
    
    if not email_pass:
        logger.error("OFP_APP_PASSWORD is not set. Cannot fetch ACARS emails.")
        return [], last_uid

    mail = None
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        mail.login(email_user, email_pass)
        
        # Check common possible names for the label
        possible_folders = ['"Flight Watch/ACARS"', 'Flight Watch/ACARS', '"[Gmail]/Flight Watch/ACARS"']
        status = "NO"
        
        for folder in possible_folders:
            status, _ = mail.select(folder)
            if status == "OK":
                logger.info(f"Successfully selected folder: {folder}")
                break
        
        if status != "OK":
            logger.warning(f"Failed to select ACARS folder. Trying INBOX with X-GM-RAW label search...")
            status, _ = mail.select("INBOX")
            if status != "OK":
                return [], last_uid
            
            search_query = 'X-GM-RAW "label:Flight Watch/ACARS"'
            if last_uid > 0:
                status, search_data = mail.uid('SEARCH', None, f'{search_query} UID {last_uid + 1}:*')
            else:
                # 珥덇린 湲곕룞 ??(last_uid == 0): ?ㅻ뒛??硫붿씪留?媛?몄샂 (理쒕? 6?쒓컙移?遺꾨웾 而ㅻ쾭 媛?ν븯?꾨줉 理쒓렐 硫붿씪留?
                dt = datetime.utcnow() - timedelta(days=1)
                months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                since_date = f"{dt.day:02d}-{months[dt.month - 1]}-{dt.year}"
                status, search_data = mail.uid('SEARCH', None, f'{search_query} SINCE {since_date}')
            
            if status != "OK":
                logger.error("X-GM-RAW search fallback failed.")
                return [], last_uid
        else:
            if last_uid > 0:
                status, search_data = mail.uid('SEARCH', None, f'UID {last_uid + 1}:*')
            else:
                # 珥덇린 湲곕룞 ??(last_uid == 0): ?ㅻ뒛??硫붿씪留?媛?몄샂
                dt = datetime.utcnow() - timedelta(days=1)
                months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                since_date = f"{dt.day:02d}-{months[dt.month - 1]}-{dt.year}"
                status, search_data = mail.uid('SEARCH', None, f'SINCE {since_date}')
                
            if status != "OK":
                return [], last_uid
            
        email_ids = search_data[0].split()
        if not email_ids:
            return [], last_uid
            
        highest_uid = last_uid
        
        # 硫붿씪???덈Т 留롮쓣 寃쎌슦(珥덇린 湲곕룞 ??, 理쒓렐 limit(湲곕낯 400媛? ??6?쒓컙 遺꾨웾)媛쒕쭔 ?щ씪?댁떛?섏뿬 ?쒕쾭 遺??諛⑹?
        if last_uid == 0 and len(email_ids) > limit:
            logger.info(f"Too many ACARS emails ({len(email_ids)}). Limiting to last {limit} to speed up boot.")
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
                    
                    # 6?쒓컙 ?대궡 ?꾪꽣留?濡쒖쭅 (Date ?ㅻ뜑 ?뚯떛)
                    date_header = msg.get("Date")
                    if date_header and last_uid == 0:
                        try:
                            # RFC2822 ?뺤떇??Date瑜??뚯떛?섏뿬 datetime 媛앹껜濡?蹂
                            msg_date = email.utils.parsedate_to_datetime(date_header)
                            # ?꾩옱 ?쒓컙 湲곗??쇰줈 6?쒓컙 ?댁긽 ??硫붿씪?대㈃ 臾댁떆
                            if datetime.now(msg_date.tzinfo) - msg_date > timedelta(hours=6):
                                continue
                        except Exception as parse_err:
                            logger.warning(f"Could not parse date header {date_header}: {parse_err}")
                            
                    body = get_email_body(msg)
                    
                    if not body.strip():
                        continue
                        
                    parsed_acars = parse_acars_message(body)
                    if parsed_acars:
                        parsed_acars["raw_subject"] = subject
                        results.append(parsed_acars)
                        
        return results, highest_uid

    except Exception as e:
        logger.error(f"Error fetching ACARS emails: {e}")
        return [], last_uid
    finally:
        if mail:
            try:
                mail.close()
            except:
                pass
            try:
                mail.logout()
            except:
                pass

