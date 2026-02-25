// =============================================================================
// Google Apps Script — Backend สำหรับระบบใบสมัครประกวดสื่อ
// "เยาวชนรุ่นใหม่ใส่ใจสิทธิชุมชน (Young & Smart Citizen)"
// สถาบันพระปกเกล้า
// =============================================================================
//
// 📋 วิธีตั้งค่า:
// 1. เปิด Google Sheets ใหม่ → Extensions → Apps Script
// 2. ลบโค้ดเก่า แล้ว copy โค้ดนี้วาง
// 3. แก้ SPREADSHEET_ID ให้ตรงกับ ID ของ Google Sheets (จาก URL)
// 4. แก้ FOLDER_ID ให้ตรงกับ ID ของ Google Drive Folder ที่จะเก็บไฟล์
// 5. กด Deploy → New deployment → Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 6. คัดลอก URL ที่ได้ไปใส่ใน Frontend (CONFIG.GAS_URL)
//
// 📌 Column ใน Google Sheets (Row 1 เป็น Header):
// A: Timestamp | B: ชื่อทีม | C: ชื่อผลงาน | D: สถานศึกษา | E: ประเภทสื่อ
// F: อจ.ชื่อ | G: อจ.ตำแหน่ง | H: อจ.ที่อยู่ | I: อจ.เบอร์โทร
// J: นศ.1 ชื่อ | K: นศ.1 ตำแหน่ง | L: นศ.1 ที่อยู่ | M: นศ.1 เบอร์โทร
// N: นศ.2 ชื่อ | O: นศ.2 ตำแหน่ง | P: นศ.2 ที่อยู่ | Q: นศ.2 เบอร์โทร
// R: นศ.3 ชื่อ | S: นศ.3 ตำแหน่ง | T: นศ.3 ที่อยู่ | U: นศ.3 เบอร์โทร
// V: ลิงก์ไฟล์ (คั่นด้วย comma)
// =============================================================================

// ⚙️ ตั้งค่า — แก้ไขให้ตรง
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const FOLDER_ID = 'YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE';
const SHEET_NAME = 'Applications'; // ชื่อ Sheet

// =============================================================================
// ฟังก์ชัน setup — รันครั้งเดียวเพื่อสร้าง Header
// =============================================================================
function setupSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  const headers = [
    'Timestamp', 'ชื่อทีม', 'ชื่อผลงาน', 'สถานศึกษา', 'ประเภทสื่อ',
    'อจ.ชื่อ', 'อจ.ตำแหน่ง', 'อจ.ที่อยู่', 'อจ.เบอร์โทร',
    'นศ.1 ชื่อ', 'นศ.1 ตำแหน่ง', 'นศ.1 ที่อยู่', 'นศ.1 เบอร์โทร',
    'นศ.2 ชื่อ', 'นศ.2 ตำแหน่ง', 'นศ.2 ที่อยู่', 'นศ.2 เบอร์โทร',
    'นศ.3 ชื่อ', 'นศ.3 ตำแหน่ง', 'นศ.3 ที่อยู่', 'นศ.3 เบอร์โทร',
    'ลิงก์ไฟล์'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // จัดรูปแบบ Header
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1B2A4A');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');

  // Freeze Header Row
  sheet.setFrozenRows(1);

  // ปรับความกว้าง Column
  sheet.setColumnWidth(1, 160); // Timestamp
  sheet.setColumnWidth(2, 150); // ชื่อทีม
  sheet.setColumnWidth(3, 200); // ชื่อผลงาน
  sheet.setColumnWidth(4, 200); // สถานศึกษา
  sheet.setColumnWidth(5, 120); // ประเภทสื่อ

  Logger.log('✅ Sheet setup complete!');
}

// =============================================================================
// doPost — รับข้อมูลจากฟอร์ม
// =============================================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    const folder = DriveApp.getFolderById(FOLDER_ID);

    // อัปโหลดไฟล์
    const fileLinks = [];
    if (data.files && data.files.length > 0) {
      data.files.forEach(function(file, index) {
        try {
          const blob = Utilities.newBlob(
            Utilities.base64Decode(file.data),
            file.type,
            data.teamName + '_file' + (index + 1) + '_' + file.name
          );
          const driveFile = folder.createFile(blob);
          driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          fileLinks.push(driveFile.getUrl());
        } catch (fileErr) {
          Logger.log('File upload error: ' + fileErr.message);
        }
      });
    }

    // เขียนลง Sheet
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
    const mediaLabel = data.mediaType === 'poster' ? 'poster' : 'social_media';

    const row = [
      timestamp,
      data.teamName || '',
      data.workTitle || '',
      data.institution || '',
      mediaLabel,
      data.advisorName || '',
      data.advisorPosition || '',
      data.advisorAddress || '',
      data.advisorPhone || '',
      data.student1Name || '',
      data.student1Position || '',
      data.student1Address || '',
      data.student1Phone || '',
      data.student2Name || '',
      data.student2Position || '',
      data.student2Address || '',
      data.student2Phone || '',
      data.student3Name || '',
      data.student3Position || '',
      data.student3Address || '',
      data.student3Phone || '',
      fileLinks.join(', ')
    ];

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success', message: 'บันทึกเรียบร้อย' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('doPost Error: ' + err.message);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// =============================================================================
// doGet — Admin ดึงข้อมูล
// =============================================================================
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || 'getAll';

    if (action === 'getAll') {
      return getAllApplications();
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('doGet Error: ' + err.message);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// =============================================================================
// ดึงข้อมูลทั้งหมด
// =============================================================================
function getAllApplications() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success', data: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, 22);
  const values = dataRange.getValues();

  const result = values.map(function(row) {
    const fileLinksStr = row[21] || '';
    const fileLinks = fileLinksStr ? fileLinksStr.split(',').map(function(s) { return s.trim(); }) : [];

    return {
      timestamp: row[0],
      teamName: row[1],
      workTitle: row[2],
      institution: row[3],
      mediaType: row[4],
      advisorName: row[5],
      advisorPosition: row[6],
      advisorAddress: row[7],
      advisorPhone: row[8],
      student1Name: row[9],
      student1Position: row[10],
      student1Address: row[11],
      student1Phone: row[12],
      student2Name: row[13],
      student2Position: row[14],
      student2Address: row[15],
      student2Phone: row[16],
      student3Name: row[17],
      student3Position: row[18],
      student3Address: row[19],
      student3Phone: row[20],
      fileLinks: fileLinks
    };
  });

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'success', data: result }))
    .setMimeType(ContentService.MimeType.JSON);
}
