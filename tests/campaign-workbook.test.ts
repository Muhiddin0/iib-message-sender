import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { createCampaignWorkbook } from "@/lib/export/campaign-workbook";
import type { CampaignSummary, Delivery } from "@/types/domain";

describe("campaign Excel export", () => {
  it("creates a visual dashboard, channel statistics, warning, and safe hyperlinks", async () => {
    const campaign: CampaignSummary = {
      id: "campaign-a",
      mode: "forward",
      kind: "text",
      body: "=FORMULA()",
      sourceMessageLink: "https://t.me/source/42",
      sourceMessageId: "42",
      sourceChatTitle: "Source",
      status: "completed",
      totalCount: 1,
      sentCount: 1,
      failedCount: 0,
      pendingCount: 0,
      created: "2026-08-29T08:00:00.000Z",
      finishedAt: "2026-08-29T08:01:00.000Z",
    };
    const delivery: Delivery = {
      id: "delivery-a",
      campaignId: campaign.id,
      chatTitle: "Target",
      chatType: "channel",
      status: "sent",
      telegramMessageId: "99",
      telegramMessageLink: "https://t.me/target/99",
      errorMessage: null,
      sentAt: "2026-08-29T08:00:30.000Z",
      views: 10,
      reactions: 2,
      replies: 1,
    };

    const output = await createCampaignWorkbook(
      { campaigns: [campaign], deliveries: [delivery] },
      new Date("2026-08-29T09:00:00.000Z"),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(output);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Dashboard",
      "Kanallar statistikasi",
      "Kampaniya",
      "Yetkazishlar",
      "Ogohlantirish",
    ]);
    expect(workbook.getWorksheet("Dashboard")?.getCell("A1").value).toBe("OSING  •  KAMPANIYA DASHBOARDI");
    expect(workbook.getWorksheet("Kanallar statistikasi")?.getCell("E2").value).toBe(10);
    expect(workbook.getWorksheet("Kanallar statistikasi")?.getCell("H2").value).toBe(0.3);
    expect(workbook.getWorksheet("Kanallar statistikasi")?.getCell("J2").value).toMatchObject({
      hyperlink: delivery.telegramMessageLink,
    });
    expect(workbook.getWorksheet("Ogohlantirish")?.getCell("B2").value).toBe("OGOHLANTIRISH");
    expect(workbook.getWorksheet("Kampaniya")?.getCell("D2").value).toBe("'=FORMULA()");
    expect(workbook.getWorksheet("Kampaniya")?.getCell("G2").value).toMatchObject({
      hyperlink: campaign.sourceMessageLink,
    });
    expect(workbook.getWorksheet("Yetkazishlar")?.getCell("H2").value).toMatchObject({
      hyperlink: delivery.telegramMessageLink,
    });
  });
});
