import imaplib
import email
from email.header import decode_header
import os
import glob
import re

# ==========================================
# 🌟 구글 이메일 설정 (본인 정보로 수정하세요)
# ==========================================
EMAIL = "mingi.kim@aerok.com"
PASSWORD = "azirhqoumvqwqzje" # 띄어쓰기 없이!
SAVE_DIR = "Booking_App/data"

def clean_old_files():
    for f in glob.glob(os.path.join(SAVE_DIR, "report*.xlsx")):
        try: os.remove(f)
        except: pass

def fetch_latest_excel():
    print("🔄 1. 구글 메일 서버 접속 중...")
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        mail.login(EMAIL, PASSWORD)
        print("✅ 로그인 성공!")

        print("🔄 2. '전체보관함(All Mail)' 자동 탐색 중...")
        # 계정 언어에 상관없이 구글의 '전체보관함' 플래그(\All)를 찾아냅니다.
        status, folders = mail.list()
        all_mail_folder = None
        
        if status == "OK":
            for folder in folders:
                folder_str = folder.decode('ascii', errors='ignore')
                if '\\All' in folder_str:
                    match = re.search(r'("[^"]+")$', folder_str)
                    if match:
                        all_mail_folder = match.group(1)
                        break
        
        # 탐색 실패 시 기본 이름들 시도
        if not all_mail_folder:
            for f in ['"[Gmail]/전체보관함"', '"[Gmail]/All Mail"']:
                try:
                    status, _ = mail.select(f)
                    if status == "OK":
                        all_mail_folder = f
                        break
                except:
                    pass

        if all_mail_folder:
            mail.select(all_mail_folder)
            print(f"✅ 전체보관함 선택 완료: {all_mail_folder}")
        else:
            mail.select("INBOX")
            print("🚨 전체보관함을 찾지 못해 INBOX로 진행합니다.")

        print("🔄 3. 최근 첨부파일이 있는 메일 검색 중...")
        # 🌟 핵심: 구글 서버에는 순수 영어(ASCII)인 'has:attachment'만 보내 에러를 원천 차단!
        status, data = mail.search(None, 'X-GM-RAW', 'has:attachment')

        if status != "OK":
            print("🚨 메일 검색 중 오류가 발생했습니다.")
            return False

        mail_ids = data[0].split()
        if not mail_ids:
            print("🚨 첨부파일이 있는 메일이 단 하나도 없습니다!")
            return False

        print(f"✅ 첨부파일이 있는 메일 총 {len(mail_ids)}개 발견!")
        
        latest_ids = mail_ids[-50:] # 넉넉하게 최근 50개의 메일을 검사
        print(f"🔍 최근 50개의 메일 중 '예약률 보고' 메일을 찾아 엑셀을 추출합니다...\n")
        
        target_date = None
        downloaded_count = 0

        # 최신 메일부터 역순으로 확인
        for i in reversed(latest_ids):
            res, msg_data = mail.fetch(i, "(RFC822)")
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    msg = email.message_from_bytes(response_part[1])
                    
                    # 제목 디코딩
                    subject, encoding = decode_header(msg["Subject"])[0]
                    if isinstance(subject, bytes):
                        subject = subject.decode(encoding if encoding else "utf-8")

                    # 파이썬 내부에서 한글 제목 검사 (에러 걱정 없음!)
                    if "예약률 보고" in subject:
                        print(f"📩 타겟 메일 발견!: {subject}")

                        # 띄어쓰기 철벽 방어 정규식 ('보고_27MAR26', '보고 _ 27MAR26' 등 모두 잡음)
                        match = re.search(r'보고\s*_\s*(\d{2}[A-Za-z]{3}\d{2})', subject)
                        if match:
                            mail_date = match.group(1).upper()
                            
                            # 가장 처음 발견된 날짜를 '기준 날짜'로 고정
                            if target_date is None:
                                target_date = mail_date
                                clean_old_files() # 과거 엑셀 파일들 싹 청소
                                print(f"  🎯[기준 날짜 설정됨]: {target_date} (이전 엑셀 삭제됨)")
                            
                            # 기준 날짜와 일치하는 메일(국내선, 국제선 모두)에서만 엑셀 다운로드
                            if mail_date == target_date:
                                for part in msg.walk():
                                    if part.get_content_maintype() == 'multipart' or part.get('Content-Disposition') is None:
                                        continue
                                        
                                    filename = part.get_filename()
                                    if filename:
                                        decoded_bytes, charset = decode_header(filename)[0]
                                        if isinstance(decoded_bytes, bytes):
                                            charset = charset or 'utf-8'
                                            filename = decoded_bytes.decode(charset)
                                            
                                        if filename.endswith('.xlsx'):
                                            downloaded_count += 1
                                            safe_filename = f"report_{downloaded_count}_{filename}"
                                            
                                            os.makedirs(SAVE_DIR, exist_ok=True)
                                            filepath = os.path.join(SAVE_DIR, safe_filename)
                                            
                                            with open(filepath, 'wb') as f:
                                                f.write(part.get_payload(decode=True))
                                            print(f"    📥 다운로드 성공: {safe_filename}")

        mail.logout()
        print(f"\n🎉 총 {downloaded_count}개의 엑셀 파일 다운로드 완료!")
        return target_date if downloaded_count > 0 else None

    except Exception as e:
        print(f"🚨 메일 연동 에러 발생: {e}")
        return None

if __name__ == "__main__":
    fetch_latest_excel()