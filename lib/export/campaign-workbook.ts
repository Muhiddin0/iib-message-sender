import "server-only";

import ExcelJS from "exceljs";

import type { CampaignSummary, Delivery } from "@/types/domain";

interface CampaignExportData {
  campaigns: CampaignSummary[];
  deliveries: Delivery[];
}

const COLORS = {
  navy: "FF172554",
  blue: "FF2563EB",
  blueLight: "FFDBEAFE",
  cyan: "FF0891B2",
  cyanLight: "FFCFFAFE",
  green: "FF16A34A",
  greenLight: "FFDCFCE7",
  amber: "FFD97706",
  amberLight: "FFFEF3C7",
  red: "FFDC2626",
  redLight: "FFFEE2E2",
  violet: "FF7C3AED",
  violetLight: "FFEDE9FE",
  slate: "FF475569",
  slateLight: "FFF1F5F9",
  white: "FFFFFFFF",
  border: "FFCBD5E1",
};

const statusLabel: Record<string, string> = {
  draft: "Qoralama",
  queued: "Navbatda",
  sending: "Yuborilmoqda",
  completed: "Yakunlangan",
  partial: "Qisman yakunlangan",
  failed: "Xato",
  cancelled: "Bekor qilingan",
  flood_wait: "Telegram cheklovi",
  sent: "Yuborildi",
  unauthorized: "Sessiya eskirgan",
  permission_denied: "Ruxsat yo‘q",
};

const kindLabel = { text: "Matn", photo: "Rasm", video: "Video" } as const;
const chatTypeLabel = { group: "Guruh", supergroup: "Superguruh", channel: "Kanal" } as const;

const headerFill: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: COLORS.navy },
};

function safeText(value: string | null | undefined) {
  const text = value ?? "";
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function excelDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? safeText(value) : date;
}

function formattedDate(value: Date | string | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return safeText(String(value));
  return new Intl.DateTimeFormat("uz-UZ", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(color = COLORS.border): Partial<ExcelJS.Borders> {
  const line: Partial<ExcelJS.Border> = { style: "thin", color: { argb: color } };
  return { top: line, left: line, bottom: line, right: line };
}

function addHyperlink(cell: ExcelJS.Cell, link: string | null, text = link ?? "") {
  if (!link) return;
  cell.value = { text, hyperlink: link };
  cell.font = { color: { argb: COLORS.blue }, underline: true };
}

function styleTable(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: COLORS.white } };
  header.fill = headerFill;
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return;
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber % 2 === 0) row.fill = solidFill("FFF8FAFC");
    row.eachCell((cell) => { cell.border = thinBorder(); });
  });
}

function sectionTitle(sheet: ExcelJS.Worksheet, row: number, title: string, fromColumn = 1, toColumn = 12) {
  sheet.mergeCells(row, fromColumn, row, toColumn);
  const cell = sheet.getCell(row, fromColumn);
  cell.value = title;
  cell.font = { bold: true, size: 12, color: { argb: COLORS.white } };
  cell.fill = solidFill(COLORS.navy);
  cell.alignment = { vertical: "middle" };
  sheet.getRow(row).height = 25;
}

function kpiCard(
  sheet: ExcelJS.Worksheet,
  range: string,
  value: string | number,
  label: string,
  color: string,
  tint: string,
) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(":")[0]);
  cell.value = {
    richText: [
      { text: String(value), font: { bold: true, size: 22, color: { argb: color } } },
      { text: `\n${label}`, font: { bold: true, size: 10, color: { argb: COLORS.slate } } },
    ],
  };
  cell.fill = solidFill(tint);
  cell.border = thinBorder(color);
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function statusStyle(cell: ExcelJS.Cell, status: string) {
  const sent = status === "sent" || status === "completed";
  const pending = ["queued", "sending", "flood_wait"].includes(status);
  const color = sent ? COLORS.green : pending ? COLORS.amber : COLORS.red;
  const tint = sent ? COLORS.greenLight : pending ? COLORS.amberLight : COLORS.redLight;
  cell.font = { bold: true, color: { argb: color } };
  cell.fill = solidFill(tint);
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function analytics(deliveries: Delivery[]) {
  const total = deliveries.length;
  const sent = deliveries.filter((delivery) => delivery.status === "sent").length;
  const failed = deliveries.filter((delivery) =>
    ["failed", "unauthorized", "permission_denied", "cancelled"].includes(delivery.status),
  ).length;
  const pending = total - sent - failed;
  const views = deliveries.reduce((sum, delivery) => sum + (delivery.views ?? 0), 0);
  const reactions = deliveries.reduce((sum, delivery) => sum + (delivery.reactions ?? 0), 0);
  const replies = deliveries.reduce((sum, delivery) => sum + (delivery.replies ?? 0), 0);
  return {
    total,
    sent,
    failed,
    pending,
    views,
    reactions,
    replies,
    successRate: total ? sent / total : 0,
    engagementRate: views ? (reactions + replies) / views : 0,
    viewsAvailable: deliveries.filter((delivery) => delivery.views !== null).length,
    reactionsAvailable: deliveries.filter((delivery) => delivery.reactions !== null).length,
    repliesAvailable: deliveries.filter((delivery) => delivery.replies !== null).length,
  };
}

function createDashboard(
  workbook: ExcelJS.Workbook,
  campaign: CampaignSummary | undefined,
  deliveries: Delivery[],
  generatedAt: Date,
) {
  const totals = analytics(deliveries);
  const sheet = workbook.addWorksheet("Dashboard", {
    properties: { tabColor: { argb: COLORS.blue } },
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = Array.from({ length: 12 }, () => ({ width: 12 }));

  sheet.mergeCells("A1:L2");
  sheet.getCell("A1").value = "OSING  •  KAMPANIYA DASHBOARDI";
  sheet.getCell("A1").font = { bold: true, size: 22, color: { argb: COLORS.white } };
  sheet.getCell("A1").fill = solidFill(COLORS.navy);
  sheet.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 28;

  sheet.mergeCells("A3:L3");
  sheet.getCell("A3").value = `Hisobot yaratildi: ${formattedDate(generatedAt)}  •  Kampaniya ID: ${campaign?.id ?? "—"}`;
  sheet.getCell("A3").font = { color: { argb: COLORS.slate }, italic: true };
  sheet.getCell("A3").alignment = { horizontal: "center" };

  sheet.mergeCells("A5:L6");
  sheet.getCell("A5").value = "⚠  MAXFIYLIK ESLATMASI: ushbu faylda chat nomlari va Telegram xabar linklari mavjud. Faqat vakolatli shaxslar bilan ulashing.";
  sheet.getCell("A5").font = { bold: true, color: { argb: COLORS.amber } };
  sheet.getCell("A5").fill = solidFill(COLORS.amberLight);
  sheet.getCell("A5").border = thinBorder(COLORS.amber);
  sheet.getCell("A5").alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  sectionTitle(sheet, 8, "Kampaniya ma’lumotlari");
  const campaignInfo = [
    ["A9", "C9", "Yuborish usuli", campaign?.mode === "forward" ? "Forward" : "Yangi xabar"],
    ["D9", "F9", "Xabar turi", campaign ? kindLabel[campaign.kind] : "—"],
    ["G9", "I9", "Kampaniya holati", campaign ? statusLabel[campaign.status] ?? campaign.status : "—"],
    ["J9", "L9", "Yaratilgan", formattedDate(campaign?.created ?? null)],
  ] as const;
  for (const [from, to, label, value] of campaignInfo) {
    sheet.mergeCells(`${from}:${to}`);
    const cell = sheet.getCell(from);
    cell.value = { richText: [
      { text: `${label}\n`, font: { bold: true, size: 9, color: { argb: COLORS.slate } } },
      { text: value, font: { bold: true, size: 12, color: { argb: COLORS.navy } } },
    ] };
    cell.fill = solidFill(COLORS.slateLight);
    cell.border = thinBorder();
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
  sheet.getRow(9).height = 46;

  sheet.mergeCells("A10:C10");
  sheet.getCell("A10").value = "Manba xabar";
  sheet.getCell("A10").font = { bold: true, color: { argb: COLORS.slate } };
  sheet.mergeCells("D10:L10");
  if (campaign?.sourceMessageLink) {
    addHyperlink(sheet.getCell("D10"), campaign.sourceMessageLink, campaign.sourceChatTitle ?? "Manba xabarni ochish");
  } else {
    sheet.getCell("D10").value = "Yangi yaratilgan xabar — manba link mavjud emas";
    sheet.getCell("D10").font = { color: { argb: COLORS.slate } };
  }
  for (const cell of [sheet.getCell("A10"), sheet.getCell("D10")]) {
    cell.fill = solidFill("FFF8FAFC");
    cell.border = thinBorder();
    cell.alignment = { vertical: "middle", wrapText: true };
  }

  sectionTitle(sheet, 12, "Umumiy statistika");
  kpiCard(sheet, "A13:C15", totals.total, "KANALLAR / CHATLAR", COLORS.blue, COLORS.blueLight);
  kpiCard(sheet, "D13:F15", totals.sent, "MUVAFFAQIYATLI", COLORS.green, COLORS.greenLight);
  kpiCard(sheet, "G13:I15", totals.failed, "XATOLAR", COLORS.red, COLORS.redLight);
  kpiCard(sheet, "J13:L15", totals.pending, "KUTILMOQDA", COLORS.amber, COLORS.amberLight);
  sheet.getRow(13).height = 24;
  sheet.getRow(14).height = 24;
  sheet.getRow(15).height = 24;

  kpiCard(sheet, "A17:C19", totals.views.toLocaleString("uz-UZ"), "UMUMIY KO‘RISHLAR", COLORS.cyan, COLORS.cyanLight);
  kpiCard(sheet, "D17:F19", totals.reactions.toLocaleString("uz-UZ"), "REAKSIYALAR", COLORS.violet, COLORS.violetLight);
  kpiCard(sheet, "G17:I19", totals.replies.toLocaleString("uz-UZ"), "JAVOBLAR", COLORS.blue, COLORS.blueLight);
  kpiCard(sheet, "J17:L19", `${(totals.successRate * 100).toFixed(1)}%`, "YETKAZISH DARAJASI", COLORS.green, COLORS.greenLight);

  sectionTitle(sheet, 21, "Analitika sifati", 1, 6);
  sectionTitle(sheet, 21, "Eng faol kanallar", 8, 12);
  const coverage = [
    ["Ko‘rishlar mavjud", totals.viewsAvailable],
    ["Reaksiyalar mavjud", totals.reactionsAvailable],
    ["Javoblar mavjud", totals.repliesAvailable],
    ["Umumiy engagement", `${(totals.engagementRate * 100).toFixed(2)}%`],
  ] as const;
  coverage.forEach(([label, value], index) => {
    const row = 22 + index;
    sheet.mergeCells(row, 1, row, 4);
    sheet.getCell(row, 1).value = label;
    sheet.mergeCells(row, 5, row, 6);
    sheet.getCell(row, 5).value = value;
    sheet.getCell(row, 5).font = { bold: true, color: { argb: COLORS.navy } };
    for (const column of [1, 5]) {
      sheet.getCell(row, column).fill = solidFill(index % 2 ? COLORS.white : COLORS.slateLight);
      sheet.getCell(row, column).border = thinBorder();
      sheet.getCell(row, column).alignment = { vertical: "middle" };
    }
  });

  const topChannels = [...deliveries]
    .sort((left, right) => (right.views ?? -1) - (left.views ?? -1))
    .slice(0, 4);
  if (topChannels.length) {
    topChannels.forEach((delivery, index) => {
      const row = 22 + index;
      sheet.mergeCells(row, 8, row, 10);
      sheet.getCell(row, 8).value = `${index + 1}. ${safeText(delivery.chatTitle)}`;
      sheet.mergeCells(row, 11, row, 12);
      sheet.getCell(row, 11).value = delivery.views === null ? "Mavjud emas" : `${delivery.views.toLocaleString("uz-UZ")} ko‘rish`;
      sheet.getCell(row, 11).font = { bold: true, color: { argb: COLORS.cyan } };
      for (const column of [8, 11]) {
        sheet.getCell(row, column).fill = solidFill(index % 2 ? COLORS.white : COLORS.cyanLight);
        sheet.getCell(row, column).border = thinBorder();
        sheet.getCell(row, column).alignment = { vertical: "middle" };
      }
    });
  } else {
    sheet.mergeCells("H22:L25");
    sheet.getCell("H22").value = "Kanal ma’lumotlari mavjud emas";
    sheet.getCell("H22").alignment = { vertical: "middle", horizontal: "center" };
    sheet.getCell("H22").fill = solidFill(COLORS.slateLight);
  }

  sheet.mergeCells("A28:L28");
  sheet.getCell("A28").value = "Batafsil ma’lumot uchun “Kanallar statistikasi” va “Yetkazishlar” varaqlarini oching.";
  sheet.getCell("A28").font = { italic: true, color: { argb: COLORS.slate } };
  sheet.getCell("A28").alignment = { horizontal: "center" };
  return sheet;
}

function createChannelStatistics(workbook: ExcelJS.Workbook, deliveries: Delivery[]) {
  const sheet = workbook.addWorksheet("Kanallar statistikasi", {
    properties: { tabColor: { argb: COLORS.cyan } },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = [
    { header: "№", key: "rank", width: 7 },
    { header: "Kanal / chat", key: "chat", width: 32 },
    { header: "Turi", key: "type", width: 15 },
    { header: "Holat", key: "status", width: 20 },
    { header: "Ko‘rishlar", key: "views", width: 14 },
    { header: "Reaksiyalar", key: "reactions", width: 14 },
    { header: "Javoblar", key: "replies", width: 14 },
    { header: "Engagement", key: "engagement", width: 14 },
    { header: "Yuborilgan vaqt", key: "sentAt", width: 21 },
    { header: "Telegram xabar", key: "link", width: 28 },
  ];

  const sorted = [...deliveries].sort((left, right) => (right.views ?? -1) - (left.views ?? -1));
  sorted.forEach((delivery, index) => {
    const engagement = delivery.views && delivery.views > 0
      ? ((delivery.reactions ?? 0) + (delivery.replies ?? 0)) / delivery.views
      : null;
    const row = sheet.addRow({
      rank: index + 1,
      chat: safeText(delivery.chatTitle),
      type: chatTypeLabel[delivery.chatType],
      status: statusLabel[delivery.status] ?? delivery.status,
      views: delivery.views ?? "Mavjud emas",
      reactions: delivery.reactions ?? "Mavjud emas",
      replies: delivery.replies ?? "Mavjud emas",
      engagement,
      sentAt: excelDate(delivery.sentAt),
    });
    if (engagement !== null) row.getCell("engagement").numFmt = "0.00%";
    row.getCell("sentAt").numFmt = "dd.mm.yyyy hh:mm";
    addHyperlink(row.getCell("link"), delivery.telegramMessageLink, delivery.telegramMessageLink ? "Xabarni ochish ↗" : "");
    statusStyle(row.getCell("status"), delivery.status);
  });
  styleTable(sheet);
  sheet.getColumn("rank").alignment = { horizontal: "center" };
  for (const key of ["views", "reactions", "replies", "engagement"] as const) {
    sheet.getColumn(key).alignment = { horizontal: "center" };
  }
  return sheet;
}

function createCampaignSheet(workbook: ExcelJS.Workbook, campaignsData: CampaignSummary[]) {
  const sheet = workbook.addWorksheet("Kampaniya", { properties: { tabColor: { argb: COLORS.violet } } });
  sheet.columns = [
    { header: "Kampaniya ID", key: "id", width: 22 },
    { header: "Usul", key: "mode", width: 14 },
    { header: "Xabar turi", key: "kind", width: 14 },
    { header: "Matn / izoh", key: "body", width: 48 },
    { header: "Manba chat", key: "sourceChat", width: 28 },
    { header: "Manba xabar ID", key: "sourceId", width: 18 },
    { header: "Manba link", key: "sourceLink", width: 42 },
    { header: "Holat", key: "status", width: 20 },
    { header: "Jami", key: "total", width: 10 },
    { header: "Yuborildi", key: "sent", width: 12 },
    { header: "Xato", key: "failed", width: 10 },
    { header: "Kutilmoqda", key: "pending", width: 14 },
    { header: "Yaratilgan", key: "created", width: 20 },
    { header: "Yakunlangan", key: "finished", width: 20 },
  ];
  for (const campaign of campaignsData) {
    const row = sheet.addRow({
      id: safeText(campaign.id),
      mode: campaign.mode === "forward" ? "Forward" : "Yangi xabar",
      kind: kindLabel[campaign.kind],
      body: safeText(campaign.body),
      sourceChat: safeText(campaign.sourceChatTitle),
      sourceId: safeText(campaign.sourceMessageId),
      status: statusLabel[campaign.status] ?? campaign.status,
      total: campaign.totalCount,
      sent: campaign.sentCount,
      failed: campaign.failedCount,
      pending: campaign.pendingCount,
      created: excelDate(campaign.created),
      finished: excelDate(campaign.finishedAt),
    });
    addHyperlink(row.getCell("sourceLink"), campaign.sourceMessageLink);
    row.getCell("created").numFmt = "dd.mm.yyyy hh:mm";
    row.getCell("finished").numFmt = "dd.mm.yyyy hh:mm";
    statusStyle(row.getCell("status"), campaign.status);
  }
  styleTable(sheet);
  return sheet;
}

function createDeliverySheet(workbook: ExcelJS.Workbook, campaignsData: CampaignSummary[], deliveriesData: Delivery[]) {
  const campaignById = new Map(campaignsData.map((campaign) => [campaign.id, campaign]));
  const sheet = workbook.addWorksheet("Yetkazishlar", { properties: { tabColor: { argb: COLORS.green } } });
  sheet.columns = [
    { header: "Delivery ID", key: "id", width: 22 },
    { header: "Kampaniya ID", key: "campaignId", width: 22 },
    { header: "Usul", key: "mode", width: 14 },
    { header: "Chat", key: "chat", width: 30 },
    { header: "Chat turi", key: "chatType", width: 14 },
    { header: "Holat", key: "status", width: 20 },
    { header: "Telegram xabar ID", key: "messageId", width: 20 },
    { header: "Telegram xabar linki", key: "messageLink", width: 40 },
    { header: "Xato", key: "error", width: 44 },
    { header: "Yuborilgan vaqt", key: "sentAt", width: 20 },
    { header: "Ko‘rishlar", key: "views", width: 12 },
    { header: "Reaksiyalar", key: "reactions", width: 12 },
    { header: "Javoblar", key: "replies", width: 12 },
  ];
  for (const delivery of deliveriesData) {
    const campaign = campaignById.get(delivery.campaignId);
    const row = sheet.addRow({
      id: safeText(delivery.id),
      campaignId: safeText(delivery.campaignId),
      mode: campaign?.mode === "forward" ? "Forward" : "Yangi xabar",
      chat: safeText(delivery.chatTitle),
      chatType: chatTypeLabel[delivery.chatType],
      status: statusLabel[delivery.status] ?? delivery.status,
      messageId: safeText(delivery.telegramMessageId),
      error: safeText(delivery.errorMessage),
      sentAt: excelDate(delivery.sentAt),
      views: delivery.views ?? "Mavjud emas",
      reactions: delivery.reactions ?? "Mavjud emas",
      replies: delivery.replies ?? "Mavjud emas",
    });
    addHyperlink(row.getCell("messageLink"), delivery.telegramMessageLink);
    row.getCell("sentAt").numFmt = "dd.mm.yyyy hh:mm";
    statusStyle(row.getCell("status"), delivery.status);
  }
  styleTable(sheet);
  return sheet;
}

function createWarningSheet(workbook: ExcelJS.Workbook, data: CampaignExportData, generatedAt: Date) {
  const warning = workbook.addWorksheet("Ogohlantirish", {
    properties: { tabColor: { argb: COLORS.amber } },
    views: [{ showGridLines: false }],
  });
  warning.columns = [{ width: 4 }, { width: 28 }, { width: 28 }, { width: 28 }, { width: 18 }];
  warning.mergeCells("B2:E2");
  warning.getCell("B2").value = "OGOHLANTIRISH";
  warning.getCell("B2").font = { bold: true, size: 18, color: { argb: "FF92400E" } };
  warning.getCell("B2").fill = solidFill(COLORS.amberLight);
  warning.getCell("B2").alignment = { vertical: "middle", horizontal: "center" };
  warning.getRow(2).height = 34;
  warning.mergeCells("B4:E6");
  warning.getCell("B4").value =
    "Bu Excel fayli Telegram kampaniyasi, chat nomlari va xabar linklarini o‘z ichiga oladi. Uni faqat vakolatli shaxslar bilan ulashing va xavfsiz joyda saqlang. Linklar ochilishidan oldin Telegram hisobini tekshiring.";
  warning.getCell("B4").alignment = { vertical: "middle", wrapText: true };
  warning.getCell("B4").font = { size: 12, color: { argb: "FF78350F" } };
  warning.getCell("B4").fill = solidFill("FFFFFBEB");
  warning.getCell("B8").value = "Yaratilgan vaqt";
  warning.getCell("C8").value = generatedAt;
  warning.getCell("C8").numFmt = "dd.mm.yyyy hh:mm";
  warning.getCell("B9").value = "Kampaniyalar";
  warning.getCell("C9").value = data.campaigns.length;
  warning.getCell("B10").value = "Kanallar / chatlar";
  warning.getCell("C10").value = data.deliveries.length;
  warning.getCell("B12").value = "Eslatma";
  warning.getCell("C12").value = "Ma’lumotlar eksport yaratilgan vaqtdagi holatni aks ettiradi.";
  for (const cell of ["B8", "B9", "B10", "B12"]) warning.getCell(cell).font = { bold: true };
  return warning;
}

export async function createCampaignWorkbook(data: CampaignExportData, generatedAt = new Date()) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Osing Admin Dashboard";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.views = [{ x: 0, y: 0, width: 16000, height: 10000, activeTab: 0, firstSheet: 0, visibility: "visible" }];

  createDashboard(workbook, data.campaigns[0], data.deliveries, generatedAt);
  createChannelStatistics(workbook, data.deliveries);
  createCampaignSheet(workbook, data.campaigns);
  createDeliverySheet(workbook, data.campaigns, data.deliveries);
  createWarningSheet(workbook, data, generatedAt);

  return workbook.xlsx.writeBuffer();
}
