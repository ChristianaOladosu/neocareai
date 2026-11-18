import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { pool } from '../../database/db.js';
import { asyncHandler, HttpError } from '../../utils/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { audit } from '../audit/audit.service.js';
import { buildReport, KINDS, toCsv, type Report } from './reports.service.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);
const params = z.object({ kind: z.string(), from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }), newbornId: z.string().uuid().optional(), format: z.enum(['json', 'csv', 'pdf']).default('json') });

reportsRouter.get('/kinds', (req, res) => res.json(Object.entries(KINDS).filter(([, d]) => req.user!.permissions.has(d.group === 'clinical' ? 'reports:clinical' : 'reports:operational')).map(([key, d]) => ({ key, ...d }))));

function pdf(r: Report): Promise<Buffer> {
  return new Promise((resolve) => {
    const d = new PDFDocument({ size: 'A4', margin: 42, info: { Title: r.title, Author: 'NeocareAI (synthetic demonstration)' } }); const chunks: Buffer[] = []; d.on('data', (c) => chunks.push(c)); d.on('end', () => resolve(Buffer.concat(chunks)));
    d.fontSize(18).fillColor('#17182F').text(r.title); d.moveDown(0.2).fontSize(9).fillColor('#555').text(`Generated ${r.generatedAt}`); d.fillColor('#8A2B2B').fontSize(9).text(r.note); d.moveDown();
    d.fillColor('#17182F').fontSize(10); for (const [k, v] of r.summary) d.text(`${k}: ${v}`);
    for (const s of r.sections) {
      d.moveDown().fontSize(12).fillColor('#49416D').text(s.title).moveDown(0.3); d.fontSize(8).fillColor('#17182F'); const w = (d.page.width - 84) / Math.max(1, s.columns.length);
      const row = (cells: Array<string | number | null>, bold: boolean) => { if (d.y > d.page.height - 70) d.addPage(); const y = d.y; let h = 0; cells.forEach((c, i) => { d.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(String(c ?? ''), 42 + i * w, y, { width: w - 4 }); h = Math.max(h, d.y - y); d.y = y; }); d.y = y + h + 3; };
      row(s.columns, true); for (const x of s.rows.slice(0, 400)) row(x, false); if (s.rows.length > 400) d.text(`… ${s.rows.length - 400} more rows in the CSV export`);
    }
    d.end();
  });
}

reportsRouter.post('/', asyncHandler(async (req, res) => {
  const p = params.parse(req.body); const u = req.user!;
  if (new Date(p.to) < new Date(p.from)) throw new HttpError(400, 'The end date must be after the start date.', 'validation_error');
  const rep = await buildReport(u, p.kind, { from: p.from, to: p.to, newbornId: p.newbornId });
  if (p.format === 'json') return res.json(rep);
  if (!u.permissions.has('reports:export')) throw new HttpError(403, 'Your role cannot export reports.', 'forbidden');   // controlled exports
  const rows = rep.sections.reduce((a, s) => a + s.rows.length, 0);
  const h = await pool.query('INSERT INTO reports(hospital_id,generated_by,kind,params,row_count,format) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [u.hospitalId, u.id, p.kind, JSON.stringify({ from: p.from, to: p.to, newbornId: p.newbornId ?? null }), rows, p.format]);
  await audit({ hospitalId: u.hospitalId, userId: u.id, action: 'report.export', resourceType: 'report', resourceId: h.rows[0].id, metadata: { kind: p.kind, format: p.format, rows, newbornId: p.newbornId ?? null } });
  const name = `neocareai-${p.kind}-${p.from.slice(0, 10)}.${p.format}`;
  res.setHeader('content-disposition', `attachment; filename="${name}"`);
  if (p.format === 'csv') { res.type('text/csv; charset=utf-8').send(toCsv(rep)); } else { res.type('application/pdf').send(await pdf(rep)); }
}));

reportsRouter.get('/history', asyncHandler(async (req, res) => {
  const all = req.user!.permissions.has('audit:read');
  res.json((await pool.query(`SELECT r.id, r.kind, r.params, r.row_count, r.format, r.created_at, u.full_name AS generated_by FROM reports r JOIN users u ON u.id=r.generated_by WHERE r.hospital_id=$1 AND ($2::boolean OR r.generated_by=$3) ORDER BY r.created_at DESC LIMIT 100`, [req.user!.hospitalId, all, req.user!.id])).rows);
}));
