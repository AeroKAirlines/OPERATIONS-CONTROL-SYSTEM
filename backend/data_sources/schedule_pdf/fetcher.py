import imaplib
import email
from email.header import decode_header
import io
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple

from backend.core.config import settings
from backend.data_sources.schedule_pdf.parser import parse_draft_pdf

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

def fetch_pdf_emails(last_uid: int = 0, limit: int = 10, since_days: int = 0) -> Tuple[List[Dict[str, Any]], int]:
    """
    Connects to IMAP, searches for 'RAMP/CJJ RAMP TABLE' labeled emails,
    extracts the PDF, parses it, and returns the parsed data along with the highest UID.
    """
    email_user = settings.OFP_EMAIL
    email_pass = settings.OFP_APP_PASSWORD
    
    if not email_pass:
        logger.error("OFP_APP_PASSWORD is not set. Cannot fetch PDF emails.")
        return [], last_uid

    mail = imaplib.IMAP4_SSL("imap.gmail.com")
    
    try:
        mail.login(email_user, email_pass)
        
        # Check common possible names for the label
        possible_folders = ['"RAMP/CJJ RAMP TABLE"']
        status = "NO"
        
        for folder in possible_folders:
            status, _ = mail.select(folder)
            if status == "OK":
                logger.info(f"Successfully selected folder: {folder}")
                break
        
        if status != "OK":
            logger.warning(f"Failed to select RAMP/CJJ RAMP TABLE folder. Trying INBOX with X-GM-RAW label search...")
            status, _ = mail.select("INBOX")
            if status != "OK":
                return [], last_uid
            
            search_query = 'X-GM-RAW "label:ramp-cjj-ramp-table"'
            if last_uid > 0:
                status, search_data = mail.uid('SEARCH', None, f'{search_query} UID {last_uid + 1}:*')
            elif since_days > 0:
                dt = datetime.utcnow() - timedelta(days=since_days)
                months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                since_date = f"{dt.day:02d}-{months[dt.month - 1]}-{dt.year}"
                status, search_data = mail.uid('SEARCH', None, f'{search_query} SINCE {since_date}')
            else:
                status, search_data = mail.search(None, search_query)
                
            if status != "OK":
                logger.error("X-GM-RAW search fallback failed.")
                return [], last_uid
        else:
            if last_uid > 0:
                status, search_data = mail.uid('SEARCH', None, f'UID {last_uid + 1}:*')
            elif since_days > 0:
                dt = datetime.utcnow() - timedelta(days=since_days)
                months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                since_date = f"{dt.day:02d}-{months[dt.month - 1]}-{dt.year}"
                status, search_data = mail.uid('SEARCH', None, f'SINCE {since_date}')
            else:
                status, search_data = mail.search(None, 'ALL')
                
            if status != "OK":
                return [], last_uid
            
        email_ids = search_data[0].split()
        if not email_ids:
            return [], last_uid
            
        highest_uid = last_uid
        
        if last_uid > 0 or since_days > 0:
            fetch_ids = email_ids
        else:
            fetch_ids = email_ids[-limit:]
        
        results = []
        for e_id in fetch_ids:
            if last_uid > 0 or since_days > 0:
                current_uid = int(e_id)
                if last_uid > 0 and current_uid <= last_uid:
                    continue
                status, msg_data = mail.uid('FETCH', e_id, '(RFC822)')
            else:
                status, msg_data = mail.fetch(e_id, '(RFC822)')
                current_uid = 0
                
            if status != "OK":
                continue
                
            if current_uid > highest_uid:
                highest_uid = current_uid
                
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    import email
                    msg = email.message_from_bytes(response_part[1])
                    
                    # 14-day limit logic if it was not handled by search
                    date_header = msg.get("Date")
                    if date_header and last_uid == 0 and since_days > 0:
                        try:
                            import email.utils
                            msg_date = email.utils.parsedate_to_datetime(date_header)
                            if datetime.now(msg_date.tzinfo) - msg_date > timedelta(days=since_days):
                                continue
                        except Exception as parse_err:
                            pass

                    subject = decode_mime_words(msg.get("Subject", ""))
                    
                    pdf_bytes_list = []
                    for part in msg.walk():
                        if part.get_content_maintype() == 'multipart':
                            continue
                        if part.get('Content-Disposition') is None:
                            continue
                            
                        filename = part.get_filename()
                        if filename:
                            filename = decode_mime_words(filename)
                            if filename.lower().endswith('.pdf'):
                                pdf_bytes = part.get_payload(decode=True)
                                pdf_bytes_list.append(io.BytesIO(pdf_bytes))
                                
                    if pdf_bytes_list:
                        parsed_data = parse_draft_pdf(pdf_bytes_list)
                        if parsed_data:
                            results.extend(parsed_data)
                            
        return results, highest_uid

    except Exception as e:
        logger.error(f"Error fetching PDF emails: {e}")
        return [], last_uid
    finally:
        try:
            mail.close()
        except:
            pass
        try:
            mail.logout()
        except:
            pass
