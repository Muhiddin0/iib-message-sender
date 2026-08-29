/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const campaigns = app.findCollectionByNameOrId("campaigns");
  campaigns.fields.add(
    new TextField({ name: "source_message_link", max: 1000 }),
    new TextField({ name: "source_message_id", max: 32 }),
    new TextField({ name: "source_chat_title", max: 255 }),
  );
  app.save(campaigns);

  const deliveries = app.findCollectionByNameOrId("campaign_deliveries");
  deliveries.fields.add(
    new TextField({ name: "telegram_message_link", max: 1000 }),
  );
  app.save(deliveries);
}, (app) => {
  const deliveries = app.findCollectionByNameOrId("campaign_deliveries");
  deliveries.fields.removeByName("telegram_message_link");
  app.save(deliveries);

  const campaigns = app.findCollectionByNameOrId("campaigns");
  campaigns.fields.removeByName("source_message_link");
  campaigns.fields.removeByName("source_message_id");
  campaigns.fields.removeByName("source_chat_title");
  app.save(campaigns);
});
