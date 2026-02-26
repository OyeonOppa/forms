// =============================================================================
// Google Apps Script — Backend (รองรับ Chunked Upload สำหรับไฟล์ขนาดใหญ่)
// "เยาวชนรุ่นใหม่ใส่ใจสิทธิชุมชน (Young & Smart Citizen)"
// สถาบันพระปกเกล้า
// =============================================================================
//
// 📋 วิธีตั้งค่า:
// 1. เปิด Google Sheets ใหม่ → Extensions → Apps Script
// 2. ลบโค้ดเก่า แล้ว copy โค้ดนี้วาง
// 3. แก้ SPREADSHEET_ID, FOLDER_ID, TEMP_FOLDER_ID ให้ตรง
// 4. รัน setupSheet() ครั้งเดียวเพื่อสร้าง Header
// 5. Deploy → New deployment → Web app (Execute as: Me, Access: Anyone)
// 6. คัดลอก URL ไปใส่ใน Frontend (CONFIG.GAS_URL)
//
// 🗂️ FOLDER แนะนำให้สร้าง 2 folder ใน Drive:
//   - FOLDER_ID      : เก็บไฟล์ผลงานถาวร
//   - TEMP_FOLDER_ID : พักไฟล์ chunks ระหว่างอัปโหลด (ล้างได้ทีหลัง)
// =============================================================================

const SPREADSHEET_ID  = 'YOUR_SPREADSHEET_ID_HERE';
const FOLDER_ID       = 'YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE';
const TEMP_FOLDER_ID  = 'YOUR_TEMP_FOLDER_ID_HERE'; // ✏️ folder พัก chunks
const SHEET_NAME      = 'Applications';

// =============================================================================
// setupSheet — รันครั้งเดียว
// =============================================================================
function setupSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  const headers = [
    'Timestamp', 'ชื่อทีม', 'ชื่อผลงาน', 'สถานศึกษา', 'ประเภทสื่อ',
    'อจ.ชื่อ', 'อจ.ตำแหน่ง', 'อจ.ที่อยู่', 'อจ.เบอร์โทร',
    'นศ.1 ชื่อ', 'นศ.1 ตำแหน่ง', 'นศ.1 ที่อยู่', 'นศ.1 เบอร์โทร',
    'นศ.2 ชื่อ', 'นศ.2 ตำแหน่ง', 'นศ.2 ที่อยู่', 'นศ.2 เบอร์โทร',
    'นศ.3 ชื่อ', 'นศ.3 ตำแหน่ง', 'นศ.3 ที่อยู่', 'นศ.3 เบอร์โทร',
    'ลิงก์ไฟล์'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const hr = sheet.getRange(1, 1, 1, headers.length);
  hr.setFontWeight('bold').setBackground('#1B2A4A').setFontColor('#FFFFFF').setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 160); sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 200); sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(5, 120);
  Logger.log('✅ Sheet setup complete!');
}

// =============================================================================
// doPost — router หลัก
// =============================================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || 'submitDirect';

    switch (action) {
      case 'submitDirect':  return handleDirect(data);
      case 'uploadChunk':   return handleChunk(data);
      case 'finalize':      return handleFinalize(data);
      default:
        return jsonResponse({ status: 'error', message: 'Unknown action: ' + action });
    }
  } catch (err) {
    Logger.log('doPost Error: ' + err.message);
    return jsonResponse({ status: 'error', message: err.message });
  }
}

// =============================================================================
// handleDirect — ส่งไฟล์เล็กตรงๆ (< 4MB) เหมือนระบบเดิม
// =============================================================================
function handleDirect(data) {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const fileLinks = [];

  if (data.files && data.files.length > 0) {
    data.files.forEach(function(file, index) {
      try {
        const blob = Utilities.newBlob(
          Utilities.base64Decode(file.data),
          file.type,
          (data.formMeta ? data.formMeta.teamName : 'file') + '_' + (index + 1) + '_' + file.name
        );
        const driveFile = folder.createFile(blob);
        driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        fileLinks.push(driveFile.getUrl());
      } catch (err) {
        Logger.log('Direct upload error: ' + err.message);
      }
    });
  }

  if (data.formMeta) {
    writeRow(data.formMeta, fileLinks);
  }

  return jsonResponse({ status: 'success', fileLinks: fileLinks });
}

// =============================================================================
// handleChunk — รับ chunk และต่อไฟล์ใน ScriptProperties
// ✏️ ใช้ PropertiesService เก็บ base64 chunks ทีละส่วน
// =============================================================================
function handleChunk(data) {
  const props = PropertiesService.getScriptProperties();
  const key = 'chunk_' + data.uploadId + '_' + data.chunkIndex;

  // เก็บ chunk ลง Properties
  props.setProperty(key, data.chunkData);

  // บันทึก metadata chunk แรก
  if (data.chunkIndex === 0) {
    props.setProperty('meta_' + data.uploadId, JSON.stringify({
      fileName: data.fileName,
      fileType: data.fileType,
      totalChunks: data.totalChunks,
      formMeta: data.formMeta
    }));
  }

  // ถ้าเป็น chunk สุดท้าย → รวมไฟล์
  if (data.isLastChunk) {
    return assembleChunks(data.uploadId);
  }

  return jsonResponse({ status: 'ok', chunk: data.chunkIndex });
}

// =============================================================================
// assembleChunks — รวม chunks แล้วอัปโหลด Drive
// =============================================================================
function assembleChunks(uploadId) {
  const props = PropertiesService.getScriptProperties();
  const metaStr = props.getProperty('meta_' + uploadId);
  if (!metaStr) return jsonResponse({ status: 'error', message: 'No metadata for ' + uploadId });

  const meta = JSON.parse(metaStr);
  let fullBase64 = '';

  for (let i = 0; i < meta.totalChunks; i++) {
    const chunk = props.getProperty('chunk_' + uploadId + '_' + i);
    if (!chunk) {
      Logger.log('Missing chunk ' + i + ' for ' + uploadId);
      continue;
    }
    fullBase64 += chunk;
  }

  // อัปโหลดไฟล์ไปยัง Drive
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const teamName = (meta.formMeta && meta.formMeta.teamName) ? meta.formMeta.teamName : 'file';
  const blob = Utilities.newBlob(
    Utilities.base64Decode(fullBase64),
    meta.fileType,
    teamName + '_' + meta.fileName
  );
  const driveFile = folder.createFile(blob);
  driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileUrl = driveFile.getUrl();

  // เก็บ link ไว้รอ finalize
  const linksKey = 'links_' + uploadId;
  props.setProperty(linksKey, fileUrl);

  // ล้าง chunk properties เพื่อประหยัด quota
  for (let i = 0; i < meta.totalChunks; i++) {
    props.deleteProperty('chunk_' + uploadId + '_' + i);
  }
  props.deleteProperty('meta_' + uploadId);

  return jsonResponse({ status: 'assembled', uploadId: uploadId, fileUrl: fileUrl });
}

// =============================================================================
// handleFinalize — เขียน row ลง Sheet (เรียกหลังอัปโหลดไฟล์ครบ)
// ✏️ Frontend ส่ง formMeta + fileCount มา → GAS รวม links แล้วเขียน row
// =============================================================================
function handleFinalize(data) {
  const props = PropertiesService.getScriptProperties();

  // ดึง links ทั้งหมดที่เก็บไว้จาก assembleChunks
  // (สำหรับ direct upload ก็ส่ง fileLinks มาโดยตรง)
  const allLinks = [];

  // หา property ทุกตัวที่ขึ้นต้นด้วย links_ และล้างออก
  const allProps = props.getProperties();
  Object.keys(allProps).forEach(function(k) {
    if (k.startsWith('links_')) {
      allLinks.push(allProps[k]);
      props.deleteProperty(k);
    }
  });

  // รวม fileLinks ที่อาจส่งมาตรง
  if (data.fileLinks && data.fileLinks.length > 0) {
    data.fileLinks.forEach(function(l) { allLinks.push(l); });
  }

  if (data.formMeta) {
    writeRow(data.formMeta, allLinks);
  }

  return jsonResponse({ status: 'success', message: 'บันทึกเรียบร้อย', fileCount: allLinks.length });
}

// =============================================================================
// writeRow — เขียน 1 row ลง Google Sheet
// =============================================================================
function writeRow(meta, fileLinks) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
  const mediaLabel = meta.mediaType === 'poster' ? 'poster' : 'social_media';

  const row = [
    timestamp,
    meta.teamName || '',
    meta.workTitle || '',
    meta.institution || '',
    mediaLabel,
    meta.advisorName || '', meta.advisorPosition || '', meta.advisorAddress || '', meta.advisorPhone || '',
    meta.student1Name || '', meta.student1Position || '', meta.student1Address || '', meta.student1Phone || '',
    meta.student2Name || '', meta.student2Position || '', meta.student2Address || '', meta.student2Phone || '',
    meta.student3Name || '', meta.student3Position || '', meta.student3Address || '', meta.student3Phone || '',
    fileLinks.join(', ')
  ];

  sheet.appendRow(row);
  Logger.log('✅ Row written for team: ' + meta.teamName);
}

// =============================================================================
// doGet — ดึงข้อมูลทั้งหมด (Admin)
// =============================================================================
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || 'getAll';
    if (action === 'getAll') return getAllApplications();
    return jsonResponse({ status: 'error', message: 'Unknown action' });
  } catch (err) {
    Logger.log('doGet Error: ' + err.message);
    return jsonResponse({ status: 'error', message: err.message });
  }
}

function getAllApplications() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ status: 'success', data: [] });

  const values = sheet.getRange(2, 1, lastRow - 1, 22).getValues();
  const result = values.map(function(row) {
    return {
      timestamp: row[0], teamName: row[1], workTitle: row[2], institution: row[3], mediaType: row[4],
      advisorName: row[5], advisorPosition: row[6], advisorAddress: row[7], advisorPhone: row[8],
      student1Name: row[9], student1Position: row[10], student1Address: row[11], student1Phone: row[12],
      student2Name: row[13], student2Position: row[14], student2Address: row[15], student2Phone: row[16],
      student3Name: row[17], student3Position: row[18], student3Address: row[19], student3Phone: row[20],
      fileLinks: row[21] ? row[21].split(',').map(function(s) { return s.trim(); }) : []
    };
  });

  return jsonResponse({ status: 'success', data: result });
}

// =============================================================================
// Utility
// =============================================================================
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================================================================
// cleanupOldChunks — รันด้วย Time Trigger ทุกคืน เพื่อล้าง chunk ค้าง
// ตั้งค่า: Triggers → Add Trigger → cleanupOldChunks → Time-driven → Day timer
// =============================================================================
function cleanupOldChunks() {
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  let cleaned = 0;
  Object.keys(allProps).forEach(function(k) {
    if (k.startsWith('chunk_') || k.startsWith('meta_') || k.startsWith('links_')) {
      props.deleteProperty(k);
      cleaned++;
    }
  });
  Logger.log('🧹 Cleaned ' + cleaned + ' chunk properties');
}