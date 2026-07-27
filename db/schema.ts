import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const dives = sqliteTable(
  "dives",
  {
    id: text("id").primaryKey(),
    diveNumber: integer("dive_number"),
    diveDate: text("dive_date"),
    lastModified: text("last_modified"),
    depth: text("depth"),
    averageDepth: real("average_depth"),
    minTemp: real("min_temp"),
    maxTemp: real("max_temp"),
    lengthText: text("length_text"),
    location: text("location"),
    site: text("site"),
    buddy: text("buddy"),
    notes: text("notes"),
    serialNumber: text("serial_number"),
    gpsEntryLat: real("gps_entry_lat"),
    gpsEntryLng: real("gps_entry_lng"),
    gpsExitLat: real("gps_exit_lat"),
    gpsExitLng: real("gps_exit_lng"),
    calculatedJson: text("calculated_json"),
    importedAt: text("imported_at").notNull(),
  },
  (table) => [
    index("dives_date_idx").on(table.diveDate),
    index("dives_number_idx").on(table.diveNumber),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    diveId: text("dive_id")
      .notNull()
      .references(() => dives.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    caption: text("caption"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("attachments_dive_idx").on(table.diveId)],
);

export const geocodes = sqliteTable("geocodes", {
  query: text("query").primaryKey(),
  displayName: text("display_name").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});
