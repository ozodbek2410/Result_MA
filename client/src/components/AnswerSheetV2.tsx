/**
 * AnswerSheetV2 — EvalBee darajasida scanner bilan 100% mos javob varaqasi
 *
 * Eski AnswerSheet.tsx O'ZGARMAYDI — u hali ham ishlatiladi.
 * Bu yangi scanner bilan ishlash uchun parallel versiya.
 *
 * scanner bilan mos o'lchamlar (server/python/omr/omr_config.json):
 *   corner_mark_mm  = 10   (eski 8mm — kichik corner qorong'uda topilmaydi)
 *   corner_margin_mm= 2    → corner markaz = 7mm → warp span = 196mm
 *   page_pad_mm     = 12
 *   header_h_mm     = 55   FIXED (grid top doim = 55mm, scanner uchun muhim)
 *   bubble_mm       = 6    hamma joyda (eski 5.5–7.5mm tier emas)
 *   bubble_gap_mm   = 2
 *   num_width_mm    = 7    hamma joyda (eski 6–8mm tier emas)
 *   timing_col_mm   = 4    HAR QATORDA timing mark (eski: har 5-chi qator)
 *   col_width_mm    = 41   (4+7+4×6+3×2)
 *
 * Layout formula (5 tier o'rniga 1):
 *   cols = max(2, min(4, ceil(q/30)))
 *   rows = ceil(q/cols)
 *   row_margin = rows > 28 ? 0.5mm : 1.0mm
 *
 * QR payload v2: JSON.stringify({v:2, c:variantCode, q:totalQ, t:testType})
 */
import { useEffect, useRef, memo } from 'react';
import QRCode from 'qrcode';

// ─── O'LCHAMLAR — omr_config.json bilan aynan mos ───────────────────────────
const CM  = 10;  // corner mark
const CG  = 2;   // corner gap from edge
const PP  = 12;  // page padding
const HH  = 55;  // header height FIXED
const BS  = 6;   // bubble size
const BG  = 2;   // bubble gap
const NW  = 7;   // number width
const TW  = 4;   // timing column width
const CW  = TW + NW + 4 * BS + 3 * BG; // 41mm — column width
const MXR = 30;  // max rows per column

const MONTHS = [
  'Yanvar','Fevral','Mart','Aprel','May','Iyun',
  'Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr',
];

// ─── LAYOUT FORMULA ──────────────────────────────────────────────────────────
function computeLayout(q: number) {
  const cols = Math.max(2, Math.min(4, Math.ceil(q / MXR)));
  const rows = Math.ceil(q / cols);
  const rm   = rows > 28 ? 0.5 : 1.0;
  const usable = 210 - 2 * PP; // 186mm
  const gap  = cols > 1 ? Math.min(15, (usable - cols * CW) / (cols - 1)) : 0;
  return { cols, rows, rm, gap };
}

const px = (v: number) => `${v}mm`;

const PRINT: React.CSSProperties = {
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

// ─── PROPS ───────────────────────────────────────────────────────────────────
export interface AnswerSheetV2Props {
  student: {
    fullName: string;
    variantCode: string;
    studentCode?: number;
  };
  test: {
    name: string;
    subjectName?: string;
    classNumber: number;
    groupLetter: string;
    periodMonth?: number;
    periodYear?: number;
  };
  questions: number;
  /** QR payload — string yoki JSON string: '{"v":2,"c":"CODE","q":90,"t":"test"}' */
  qrData: string;
  testType?: 'test' | 'block_test';
}

// ─── KOMPONENT ────────────────────────────────────────────────────────────────
function AnswerSheetV2({ student, test, questions, qrData, testType = 'test' }: AnswerSheetV2Props) {
  const qrRef  = useRef<HTMLCanvasElement>(null);
  const totalQ = Math.max(1, questions || 30);
  const L      = computeLayout(totalQ);

  // QR payload — agar eski format (plain string) bo'lsa, v2 formatga o'tkazish
  const qrPayload = (() => {
    try {
      const parsed = JSON.parse(qrData);
      // allaqachon JSON — tekshirib v2 formatga
      if (parsed.v === 2) return qrData;
      // v1 JSON {c,q} → v2
      return JSON.stringify({ v: 2, c: parsed.c ?? qrData, q: parsed.q ?? totalQ, t: testType });
    } catch {
      // plain string → v2
      return JSON.stringify({ v: 2, c: qrData, q: totalQ, t: testType });
    }
  })();

  useEffect(() => {
    if (!qrRef.current) return;
    QRCode.toCanvas(qrRef.current, qrPayload, {
      width: 112,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000', light: '#fff' },
    }).catch(() => {/* silent */});
  }, [qrPayload]);

  return (
    <div
      className="answer-sheet-v2"
      style={{
        width: '210mm',
        height: '297mm',
        position: 'relative',
        background: '#fff',
        fontFamily: 'Arial, sans-serif',
        color: '#000',
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: `4mm ${PP}mm 2mm ${PP}mm`,
        margin: '0 auto',
        fontSize: 'initial',
        lineHeight: 'initial',
        letterSpacing: 'initial',
        wordSpacing: 'initial',
      }}
    >
      {/* ── 4 Corner mark 10mm × 10mm ── */}
      {(['top', 'bottom'] as const).map(v =>
        (['left', 'right'] as const).map(h => (
          <div
            key={`${v}${h}`}
            style={{
              position: 'absolute',
              [v]: px(CG),
              [h]: px(CG),
              width: px(CM),
              height: px(CM),
              background: '#000',
              ...PRINT,
            }}
          />
        ))
      )}

      {/* ══════════ HEADER 55mm FIXED ══════════ */}
      <div style={{ height: px(HH), boxSizing: 'border-box', overflow: 'hidden' }}>
        {/* Akademiya */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '2px solid #222',
          paddingBottom: '2mm', marginBottom: '2mm',
        }}>
          <img src="/logo.png" alt="" style={{ width: '11mm', height: '11mm', objectFit: 'contain' }} />
          <div style={{ flex: 1, textAlign: 'center', padding: '0 3mm' }}>
            <div style={{ fontWeight: 'bold', color: '#1a1a6e', fontSize: '14pt' }}>MATH ACADEMY</div>
            <div style={{ fontSize: '7pt', color: '#555' }}>Xususiy maktabi</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '6.5pt', color: '#444', lineHeight: 1.4 }}>
            Sharqona ta&#39;lim-tarbiya<br />
            va haqiqiy ilm maskani<br />
            <b style={{ color: '#1a1a6e' }}>&#9742; +91-333-66-22</b>
          </div>
        </div>

        {/* O'quvchi ma'lumotlari + QR */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '3mm' }}>
          <div style={{ flex: 1, fontSize: '8.5pt' }}>
            <div style={{ fontSize: '13pt', fontWeight: 'bold', marginBottom: '1.5mm' }}>
              JAVOB VARAQASI
            </div>
            <div style={{ marginBottom: '0.8mm' }}>
              <b>O&#39;quvchi:</b> {student.fullName}
            </div>
            {test.subjectName && (
              <div style={{ marginBottom: '0.8mm' }}><b>Fan:</b> {test.subjectName}</div>
            )}
            <div style={{ marginBottom: '0.8mm' }}>
              <b>Sinf:</b> {test.classNumber}-{test.groupLetter}
              &nbsp;&nbsp;
              <b>ID:</b>&nbsp;{student.studentCode ?? student.variantCode}
              &nbsp;&nbsp;
              <b>Savollar:</b>&nbsp;{totalQ}
              {test.periodMonth && test.periodYear && (
                <>&nbsp;&nbsp;<b>Davr:</b>&nbsp;{MONTHS[test.periodMonth - 1]} {test.periodYear}</>
              )}
            </div>
            <div style={{
              background: '#f4f4f4', padding: '1mm 2mm',
              border: '1px solid #ccc', fontSize: '7pt', marginTop: '1mm',
            }}>
              Doirachani <b>qora</b> yoki <b>ko&#39;k</b> ruchka bilan to&#39;liq to&#39;ldiring.
              Bitta savolga — bitta javob. Tuzatish mumkin emas.
            </div>
          </div>

          {/* QR 32mm */}
          <div style={{
            width: px(32), height: px(32),
            border: '1.5px solid #000',
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#fff',
          }}>
            <canvas ref={qrRef} style={{ display: 'block' }} />
          </div>
        </div>
      </div>

      {/* ══════════ GRID — top = HH = 55mm (doim bir xil!) ══════════ */}
      <div style={{ display: 'flex', gap: px(L.gap) }}>
        {Array.from({ length: L.cols }, (_, ci) => {
          const start = ci * L.rows + 1;
          const end   = Math.min(start + L.rows - 1, totalQ);
          if (start > totalQ) return null;

          return (
            <div key={ci} style={{ flexShrink: 0, width: px(CW) }}>
              {/* Ustun boshi — A B C D yorliqlari */}
              <div style={{ display: 'flex', alignItems: 'center', height: px(BS), marginBottom: px(1) }}>
                <div style={{ width: px(TW), flexShrink: 0 }} />
                <div style={{ width: px(NW), flexShrink: 0 }} />
                {['A', 'B', 'C', 'D'].map((l, i) => (
                  <div key={l} style={{
                    width: px(BS), textAlign: 'center',
                    fontSize: '8pt', fontWeight: 'bold',
                    flexShrink: 0,
                    marginRight: i < 3 ? px(BG) : 0,
                  }}>
                    {l}
                  </div>
                ))}
              </div>

              {/* Savol qatorlari */}
              {Array.from({ length: end - start + 1 }, (_, i) => {
                const n = start + i;
                const isLast = i === end - start;
                return (
                  <div key={n} style={{
                    display: 'flex', alignItems: 'center',
                    height: px(BS),
                    marginBottom: isLast ? 0 : px(L.rm * 2),
                  }}>
                    {/* Timing mark — HAR QATORDA */}
                    <div style={{ width: px(TW), flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      <div style={{
                        width: px(3), height: px(3),
                        background: '#000', ...PRINT,
                      }} />
                    </div>

                    {/* Raqam */}
                    <div style={{
                      width: px(NW), flexShrink: 0,
                      fontSize: '7pt', fontWeight: 'bold',
                      textAlign: 'right', paddingRight: '0.5mm',
                      lineHeight: px(BS),
                    }}>
                      {n}.
                    </div>

                    {/* A B C D bubbles */}
                    {['A', 'B', 'C', 'D'].map((l, li) => (
                      <div key={l} style={{
                        width: px(BS), height: px(BS),
                        border: '1.5px solid #000',
                        borderRadius: '50%',
                        background: '#fff',
                        boxSizing: 'border-box',
                        flexShrink: 0,
                        marginRight: li < 3 ? px(BG) : 0,
                      }} />
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(AnswerSheetV2, (p, n) =>
  p.student.variantCode === n.student.variantCode &&
  p.questions === n.questions &&
  p.qrData === n.qrData
);
