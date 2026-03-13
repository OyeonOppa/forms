/* survey.js */

/* ─────────────────────────────────────────
   Popup
───────────────────────────────────────── */
const overlay    = document.getElementById('popupOverlay');
const acceptBtn  = document.getElementById('popupAccept');

acceptBtn.addEventListener('click', () => {
  overlay.classList.add('hidden');
  // ลบออกจาก DOM หลัง transition เสร็จ
  setTimeout(() => overlay.remove(), 300);
});

/* ─────────────────────────────────────────
   "อื่นๆ" ในการศึกษา — แสดง text input
───────────────────────────────────────── */
const eduOtherRadio = document.getElementById('edu-other-radio');
const eduOtherWrap  = document.getElementById('edu-other-wrap');

if (eduOtherRadio && eduOtherWrap) {
  // listen ทุก radio ในกลุ่ม education
  document.querySelectorAll('input[name="education"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (eduOtherRadio.checked) {
        eduOtherWrap.classList.add('visible');
        eduOtherWrap.querySelector('input').focus();
      } else {
        eduOtherWrap.classList.remove('visible');
      }
    });
  });
}

/* ─────────────────────────────────────────
   Info-card answered state (ส่วนที่ 1)
───────────────────────────────────────── */
['age', 'education', 'area'].forEach(name => {
  document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
    radio.addEventListener('change', () => {
      const card = document.getElementById('card-' + name);
      if (card) card.classList.add('answered');
    });
  });
});

// อาชีพ — mark answered เมื่อพิมพ์
const occupationInput = document.querySelector('input[name="occupation"]');
if (occupationInput) {
  occupationInput.addEventListener('input', () => {
    const card = document.getElementById('card-job');
    if (card) {
      card.classList.toggle('answered', occupationInput.value.trim().length > 0);
    }
  });
}

/* ─────────────────────────────────────────
   แบบสอบถาม Q1–Q12
───────────────────────────────────────── */
const TOTAL   = 12;
const answered = new Set();

document.querySelectorAll('input[type="radio"]').forEach(radio => {
  // ข้ามข้อมูลทั่วไป
  if (['age', 'education', 'area'].includes(radio.name)) return;

  radio.addEventListener('change', function () {
    const name = this.name;

    // แสดง reason textarea
    const reasonWrap = document.getElementById('reason-' + name);
    if (reasonWrap) reasonWrap.classList.add('visible');

    // mark card
    const card = document.getElementById('card-' + name);
    if (card) card.classList.add('answered');

    answered.add(name);
    updateCounter();
    updateProgress();
  });
});

function updateCounter() {
  document.getElementById('counterText').textContent =
    `ตอบแล้ว ${answered.size} / ${TOTAL} ข้อ`;
}

function updateProgress() {
  const pct = (answered.size / TOTAL) * 100;
  document.getElementById('progressBar').style.width = pct + '%';
}

/* ─────────────────────────────────────────
   Config — วาง URL ที่ได้จาก Apps Script Deploy
───────────────────────────────────────── */
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzfbCNvjvIFCsHmGnYZpZuk3rQf2Lv6Uo9VfUT8tv-zH5gbRgJnKasl9jSedOWUVTPk/exec';

/* ─────────────────────────────────────────
   Submit
───────────────────────────────────────── */
document.getElementById('surveyForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const submitBtn = this.querySelector('button[type="submit"]');

  // loading state
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังส่ง…';

  const data = Object.fromEntries(new FormData(this));

  try {
    await fetch(APPS_SCRIPT_URL, {
      method : 'POST',
      mode   : 'no-cors',   // Apps Script Web App ต้องใช้ no-cors
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(data),
    });

    // no-cors จะไม่ได้ response กลับ แต่ข้อมูลส่งถึง Sheet แล้ว
    Swal.fire({
      icon             : 'success',
      title            : 'ส่งแบบสอบถามสำเร็จ',
      html             : 'ขอบคุณสำหรับความคิดเห็นของท่าน<br><span style="font-size:13px;color:#6B6860">สถาบันพระปกเกล้าขอขอบคุณที่ท่านมีส่วนร่วม<br>ในการพัฒนากฎหมายเพื่อสังคมไทย</span>',
      confirmButtonText: 'ปิด',
      confirmButtonColor: '#2B5741',
      allowOutsideClick: false,
      customClass      : { popup: 'swal-kpi' },
    }).then(() => {
      // รีเซ็ตฟอร์มหลังปิด popup
      document.getElementById('surveyForm').reset();
      answered.clear();
      updateCounter();
      updateProgress();
      document.querySelectorAll('.reason-wrap').forEach(w => w.classList.remove('visible'));
      document.querySelectorAll('.card').forEach(c => c.classList.remove('answered'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

  } catch (err) {
    console.error('Submit error:', err);
    submitBtn.disabled = false;
    submitBtn.textContent = 'ส่งแบบสอบถาม';
    Swal.fire({
      icon             : 'error',
      title            : 'เกิดข้อผิดพลาด',
      text             : 'ไม่สามารถส่งข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
      confirmButtonText: 'ลองใหม่',
      confirmButtonColor: '#2B5741',
    });
  }
});