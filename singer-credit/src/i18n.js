'use strict';
// Draft Sinhala / Tamil text. Must be reviewed by SINGER's language owners before production.
const LABELS = {
  en: { cashPrice: 'Cash price', downPayment: 'Down payment', loanAmount: 'Loan amount', charges: 'Charges', instalment: 'Instalment', totalRepayable: 'Total repayable', months: 'months' },
  si: { cashPrice: 'මුදල් මිල', downPayment: 'මූලික ගෙවීම', loanAmount: 'ණය මුදල', charges: 'ගාස්තු', instalment: 'වාරිකය', totalRepayable: 'ගෙවිය යුතු මුළු මුදල', months: 'මාස' },
  ta: { cashPrice: 'ரொக்க விலை', downPayment: 'முன்பணம்', loanAmount: 'கடன் தொகை', charges: 'கட்டணங்கள்', instalment: 'தவணைத் தொகை', totalRepayable: 'மொத்தத் திருப்பிச் செலுத்தல்', months: 'மாதங்கள்' }
};

const lkr = n => 'LKR ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TEMPLATES = {
  approval: {
    en: 'SINGER CREDIT: Hi {name}, your loan {loan} of {amount} is approved. Please review and sign the agreement.',
    si: 'SINGER CREDIT: {name}, ඔබේ {loan} ණය ({amount}) අනුමතයි. කරුණාකර ගිවිසුම සමාලෝචනය කර අත්සන් කරන්න.',
    ta: 'SINGER CREDIT: {name}, உங்கள் கடன் {loan} ({amount}) அங்கீகரிக்கப்பட்டது. ஒப்பந்தத்தை பார்த்து கையொப்பமிடவும்.'
  },
  decline: {
    en: 'SINGER CREDIT: Hi {name}, we could not approve your application. Reason: {reason}.',
    si: 'SINGER CREDIT: {name}, ඔබේ අයදුම්පත අනුමත කළ නොහැකි විය. හේතුව: {reason}.',
    ta: 'SINGER CREDIT: {name}, உங்கள் விண்ணப்பத்தை அங்கீகரிக்க இயலவில்லை. காரணம்: {reason}.'
  },
  agreement: {
    en: 'SINGER CREDIT: Your agreement for {loan} is ready to sign.',
    si: 'SINGER CREDIT: {loan} සඳහා ඔබේ ගිවිසුම අත්සන් කිරීමට සූදානම්.',
    ta: 'SINGER CREDIT: {loan} க்கான உங்கள் ஒப்பந்தம் கையொப்பமிட தயாராக உள்ளது.'
  },
  schedule: {
    en: 'SINGER CREDIT: Loan {loan} is active. {n} instalments of {amount}, first due {due}.',
    si: 'SINGER CREDIT: {loan} ණය සක්‍රියයි. {amount} වාරික {n}ක්, පළමු දිනය {due}.',
    ta: 'SINGER CREDIT: கடன் {loan} செயலில் உள்ளது. {amount} வீதம் {n} தவணைகள், முதல் தவணை {due}.'
  },
  pre_debit: {
    en: 'SINGER CREDIT: {amount} will be debited from your account on {due} for loan {loan}.',
    si: 'SINGER CREDIT: {loan} සඳහා {amount} ක් {due} දින ඔබේ ගිණුමෙන් අඩු කෙරේ.',
    ta: 'SINGER CREDIT: கடன் {loan} க்கு {amount} {due} அன்று உங்கள் கணக்கிலிருந்து எடுக்கப்படும்.'
  },
  receipt: {
    en: 'SINGER CREDIT: Payment of {amount} received for loan {loan}. Thank you.',
    si: 'SINGER CREDIT: {loan} සඳහා {amount} ගෙවීම ලැබුණි. ස්තූතියි.',
    ta: 'SINGER CREDIT: கடன் {loan} க்கு {amount} செலுத்தல் பெறப்பட்டது. நன்றி.'
  },
  missed: {
    en: 'SINGER CREDIT: Your instalment for loan {loan} is overdue ({days} days). Please pay {amount} to avoid penalties.',
    si: 'SINGER CREDIT: {loan} වාරිකය ප්‍රමාදයි (දින {days}). දඩ වළක්වා ගැනීමට {amount} ගෙවන්න.',
    ta: 'SINGER CREDIT: கடன் {loan} தவணை தாமதம் ({days} நாட்கள்). அபராதத்தைத் தவிர்க்க {amount} செலுத்தவும்.'
  },
  settlement: {
    en: 'SINGER CREDIT: Settlement quote for loan {loan}: {amount}, valid until {due}.',
    si: 'SINGER CREDIT: {loan} පියවීම් මිල ගණන: {amount}, {due} දක්වා වලංගුයි.',
    ta: 'SINGER CREDIT: கடன் {loan} தீர்வு மதிப்பீடு: {amount}, {due} வரை செல்லுபடியாகும்.'
  },
  closure: {
    en: 'SINGER CREDIT: Loan {loan} is fully settled and closed. Thank you.',
    si: 'SINGER CREDIT: {loan} ණය සම්පූර්ණයෙන් පියවා වසා දමා ඇත. ස්තූතියි.',
    ta: 'SINGER CREDIT: கடன் {loan} முழுமையாக செலுத்தி முடிக்கப்பட்டது. நன்றி.'
  }
};

function render(event, lang, vars) {
  const t = (TEMPLATES[event] && (TEMPLATES[event][lang] || TEMPLATES[event].en)) || event;
  return t.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
}

module.exports = { LABELS, TEMPLATES, render, lkr };
