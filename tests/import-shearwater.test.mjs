import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import initSqlJs from "sql.js";

const fixturePath = process.env.SHEARWATER_DB_FIXTURE;

test(
  "reads Shearwater Cloud dive metadata and GNSS fields",
  { skip: !fixturePath },
  async () => {
    const SQL = await initSqlJs({
      locateFile: (file) =>
        path.resolve("node_modules", "sql.js", "dist", file),
    });
    const database = new SQL.Database(fs.readFileSync(fixturePath));
    try {
      const result = database.exec(`
        SELECT d.DiveId, d.DiveNumber, d.GnssEntryLocation,
               l.calculated_values_from_samples
        FROM dive_details d
        LEFT JOIN log_data l ON l.log_id = d.DiveId
      `);
      assert.equal(result.length, 1);
      assert.ok(
        result[0].values.length >= 1,
        "expected at least one dive_details row",
      );

      const gnssIndex = result[0].columns.indexOf("GnssEntryLocation");
      const gpsRows = result[0].values.filter((row) => {
        const value = row[gnssIndex];
        return typeof value === "string" && value.trim().length > 0;
      });
      assert.equal(gpsRows.length, 2);

      for (const row of gpsRows) {
        const location = JSON.parse(String(row[gnssIndex]));
        assert.equal(typeof location.Latitude, "number");
        assert.equal(typeof location.Longitude, "number");
      }
    } finally {
      database.close();
    }
  },
);
