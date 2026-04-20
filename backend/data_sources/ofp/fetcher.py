import re
import imaplib
import email
from email.header import decode_header
import io
import logging
from datetime import datetime, timedelta
from backend.core.config import settings

logger = logging.getLogger(__name__)

def parse_ofp_subject(subject: str) -> list[dict]:
    """
    Parses the OFP email subject to extract flight numbers and CFP numbers.
    Accounts for manual typing variations (spaces, slashes, commas) and revision tags.
    """
    result = []
    
    # 1. Extract and remove Revision tag
    is_revision = False
    revision_type = ""
    rev_match = re.search(r'\[REV\.?(.*?)\]', subject, re.IGNORECASE)
    if rev_match:
        is_revision = True
        revision_type = rev_match.group(1).strip()
    
    subject_clean = re.sub(r'\[REV\.?.*?\]', '', subject, flags=re.IGNORECASE).strip()
    
    # 2. Split into Flights part and CFP part
    # Tolerant regex for " / CFP NBR: ", "CFP NBR :", "/CFPNBR:", etc.
    match = re.search(r'(.*?)/?\s*CFP\s*NBR\s*:?\s*(.*)', subject_clean, flags=re.IGNORECASE)
    
    if not match:
        logger.warning(f"Could not parse subject format: {subject}")
        return []
        
    flights_str = match.group(1).strip()
    cfps_str = match.group(2).strip()
    
    # 3. Extract individual flights
    # EOK386, 385 -> ["386", "385"] or EOK386, EOK385 -> ["386", "385"]
    flight_nums = re.findall(r'(?:EOK)?\s*(\d{3,4})', flights_str, flags=re.IGNORECASE)
    flights = [f"EOK{num.strip()}" for num in flight_nums]
    
    # 4. Extract individual CFP numbers
    cfps = re.findall(r'(\d+)', cfps_str)
    
    # 5. Map 1:1
    if len(flights) != len(cfps) and len(flights) > 0 and len(cfps) > 0:
        logger.warning(f"Mismatch in flights ({len(flights)}) and CFPs ({len(cfps)}) in subject: {subject}")
        # fallback: map all to the first CFP if there's only one
        if len(cfps) == 1:
            cfps = cfps * len(flights)
    
    for f, c in zip(flights, cfps):
        result.append({
            "flight": f,
            "cfp_nbr": c,
            "is_revision": is_revision,
            "revision_type": revision_type,
            "raw_subject": subject
        })
        
    return result

def decode_mime_words(s):
    decoded_words = decode_header(s)
    text = ""
    for word, encoding in decoded_words:
        if isinstance(word, bytes):
            text += word.decode(encoding or "utf-8", errors="ignore")
        else:
            text += word
    return text

def fetch_ofp_emails(last_uid: int = 0, limit: int = 10, since_days: int = 0) -> tuple[list[dict], int]:
    """
    Connects to IMAP, searches for 'flight-watch-ofp' labeled emails,
    and yields parsed subject data along with PDF bytes.
    Returns (results, highest_uid).
    """
    email_user = settings.OFP_EMAIL
    email_pass = settings.OFP_APP_PASSWORD
    
    if not email_pass:
        logger.error("OFP_APP_PASSWORD is not set. Cannot fetch emails.")
        return [], last_uid

    mail = imaplib.IMAP4_SSL("imap.gmail.com")
    
    try:
        mail.login(email_user, email_pass)
        
        # Check common possible names for the label
        possible_folders = ['"Flight Watch/OFP"', '"flight-watch-ofp"', 'flight-watch-ofp']
        status = "NO"
        messages = None
        
        for folder in possible_folders:
            status, messages = mail.select(folder)
            if status == "OK":
                logger.info(f"Successfully selected folder: {folder}")
                break
        
        if status != "OK":
            logger.error(f"Failed to select OFP folder. Checking available folders...")
            status, folders = mail.list()
            logger.error(f"Available folders: {folders}")
            
            # As a fallback, try to select INBOX and use Gmail's search query (X-GM-RAW)
            logger.info("Attempting fallback to INBOX using X-GM-RAW search...")
            status, messages = mail.select("INBOX")
            if status != "OK":
                return [], last_uid
            
            search_query = 'X-GM-RAW "label:flight-watch-ofp"'
            if last_uid > 0:
                status, search_data = mail.uid('SEARCH', None, f'{search_query} UID {last_uid + 1}:*')  # type: ignore
            elif since_days > 0:
                since_date = (datetime.utcnow() - timedelta(days=since_days)).strftime("%d-%b-%Y")
                status, search_data = mail.uid('SEARCH', None, f'{search_query} SINCE {since_date}')  # type: ignore
            else:
                status, search_data = mail.search(None, search_query)
                
            if status != "OK":
                logger.error("X-GM-RAW search fallback failed.")
                return [], last_uid
        else:
            # Search for all emails in this folder
            if last_uid > 0:
                status, search_data = mail.uid('SEARCH', None, f'UID {last_uid + 1}:*')  # type: ignore
            elif since_days > 0:
                since_date = (datetime.utcnow() - timedelta(days=since_days)).strftime("%d-%b-%Y")
                status, search_data = mail.uid('SEARCH', None, f'SINCE {since_date}')  # type: ignore
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
                # IMAP quirk: UID N:* returns the max UID if N is greater than max UID
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
                    msg = email.message_from_bytes(response_part[1])
                    subject = decode_mime_words(msg.get("Subject", ""))
                    
                    parsed_info_list = parse_ofp_subject(subject)
                    
                    if not parsed_info_list:
                        continue
                        
                    # Find PDF attachment
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
                                results.append({
                                    "parsed_subject_list": parsed_info_list,
                                    "pdf_filename": filename,
                                    "pdf_bytes": pdf_bytes
                                })
                                # Assuming one PDF per email for now
                                break 
        return results, highest_uid

    except Exception as e:
        logger.error(f"Error fetching OFP emails: {e}")
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

