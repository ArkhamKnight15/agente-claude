import PDFDocument from "pdfkit";
import { formatBRL, formatDateLong, toNumber } from "@/lib/format";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { getSenderProfile } from "@/server/services/settings";

/** Gera o PDF da proposta comercial (A4). */

const COLORS = { ink: "#111827", muted: "#4B5563", line: "#E5E7EB", accent: "#3B4FD8", soft: "#F3F4F6" };
const MARGIN = 56;

export async function renderProposalPdf(proposalId: string): Promise<Buffer> {
  const proposal = await db.proposal.findUnique({ where: { id: proposalId }, include: { lead: true } });
  if (!proposal) throw new NotFoundError("Proposta não encontrada.");
  const profile = await getSenderProfile();
  const sender = profile.companyName || profile.name || "Criação de sites";

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: { Title: proposal.title, Author: sender, Subject: "Proposta comercial" },
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const width = doc.page.width - MARGIN * 2;

  // Cabeçalho
  doc.rect(0, 0, doc.page.width, 6).fill(COLORS.accent);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(sender.toUpperCase(), MARGIN, MARGIN - 20, { characterSpacing: 1 });
  doc.moveDown(1.2);
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(22).text("Proposta comercial", { width });
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(12).fillColor(COLORS.muted).text(`Criação de site — ${proposal.lead.name}`, { width });
  doc.moveDown(0.8);

  const metaY = doc.y;
  const col = width / 3;
  const meta: Array<[string, string]> = [
    ["Proposta", `#${String(proposal.number).padStart(4, "0")}`],
    ["Emitida em", formatDateLong(proposal.createdAt)],
    ["Válida até", formatDateLong(proposal.validUntil)],
  ];
  meta.forEach(([label, value], i) => {
    doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted).text(label.toUpperCase(), MARGIN + i * col, metaY, { width: col - 8, characterSpacing: 0.6 });
    doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.ink).text(value, MARGIN + i * col, metaY + 12, { width: col - 8 });
  });
  doc.y = metaY + 36;
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).strokeColor(COLORS.line).lineWidth(1).stroke();
  doc.moveDown(1);

  const heading = (text: string) => {
    if (doc.y > doc.page.height - MARGIN - 80) doc.addPage();
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.ink).text(text, MARGIN, doc.y, { width });
    doc.moveDown(0.3);
  };
  const paragraph = (text: string) => {
    doc.font("Helvetica").fontSize(10.5).fillColor(COLORS.muted).text(text, MARGIN, doc.y, { width, lineGap: 3 });
  };
  const bullets = (items: string[]) => {
    for (const item of items) {
      if (doc.y > doc.page.height - MARGIN - 30) doc.addPage();
      const y = doc.y;
      doc.circle(MARGIN + 3, y + 6, 1.8).fill(COLORS.accent);
      doc.font("Helvetica").fontSize(10.5).fillColor(COLORS.muted).text(item, MARGIN + 14, y, { width: width - 14, lineGap: 3 });
      doc.moveDown(0.15);
    }
  };

  heading("Cliente");
  paragraph(`${proposal.lead.name} — ${proposal.lead.city}/${proposal.lead.state}`);

  heading("Objetivo do site");
  paragraph(proposal.objective);

  heading("Estrutura sugerida");
  bullets(proposal.structure as string[]);

  heading("Funcionalidades incluídas");
  bullets(proposal.features as string[]);

  heading("Prazo estimado");
  paragraph(`${proposal.timelineDays} dias úteis após o recebimento de todo o conteúdo (textos, fotos e logotipo) e a aprovação do layout.`);

  // Investimento em destaque
  if (doc.y > doc.page.height - MARGIN - 120) doc.addPage();
  doc.moveDown(0.8);
  const boxY = doc.y;
  doc.roundedRect(MARGIN, boxY, width, 64, 8).fill(COLORS.soft);
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text("INVESTIMENTO", MARGIN + 16, boxY + 14, { characterSpacing: 0.8 });
  doc.font("Helvetica-Bold").fontSize(22).fillColor(COLORS.ink).text(formatBRL(toNumber(proposal.price)), MARGIN + 16, boxY + 28);
  doc.y = boxY + 76;

  heading("Condições de pagamento");
  paragraph(proposal.paymentTerms);

  heading("Responsabilidades do cliente");
  bullets(proposal.clientResponsibilities as string[]);

  heading("Itens não incluídos");
  bullets(proposal.notIncluded as string[]);

  heading("Suporte e manutenção");
  paragraph(proposal.supportTerms);

  if (proposal.notes) {
    heading("Observações");
    paragraph(proposal.notes);
  }

  // Aceite
  if (doc.y > doc.page.height - MARGIN - 110) doc.addPage();
  doc.moveDown(2);
  const signY = doc.y + 30;
  doc.moveTo(MARGIN, signY).lineTo(MARGIN + width / 2 - 20, signY).strokeColor(COLORS.muted).lineWidth(0.6).stroke();
  doc.moveTo(MARGIN + width / 2 + 20, signY).lineTo(MARGIN + width, signY).stroke();
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
  doc.text(`De acordo — ${proposal.lead.name}`, MARGIN, signY + 6, { width: width / 2 - 20 });
  doc.text([profile.name, profile.companyName, profile.cnpj ? `CNPJ ${profile.cnpj}` : ""].filter(Boolean).join(" · ") || sender, MARGIN + width / 2 + 20, signY + 6, {
    width: width / 2 - 20,
  });

  // Rodapé com paginação
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const contact = [profile.email, profile.phone, profile.portfolioUrl].filter(Boolean).join("  ·  ");
    doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
    doc.text(contact, MARGIN, doc.page.height - MARGIN + 18, { width: width - 60, lineBreak: false });
    doc.text(`${i + 1}/${range.count}`, MARGIN + width - 50, doc.page.height - MARGIN + 18, { width: 50, align: "right", lineBreak: false });
  }

  doc.end();
  return done;
}
