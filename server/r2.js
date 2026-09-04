const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

function r2Ready() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

function client() {
  return new S3Client({
    region: "auto",
    endpoint: "https://" + process.env.R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

// 只上傳備份。啟動時不會從 R2 或本機把舊檔下載回來覆寫 Neon。
async function backupPunches(rows) {
  if (!r2Ready()) return;
  const body = JSON.stringify(
    { savedAt: new Date().toISOString(), count: rows.length, rows: rows },
    null,
    2,
  );
  const bucket = process.env.R2_BUCKET;
  const s3 = client();
  const day = new Date().toISOString().slice(0, 10);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: "backups/punches-" + day + ".json",
      Body: body,
      ContentType: "application/json",
    }),
  );
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: "backups/punches-latest.json",
      Body: body,
      ContentType: "application/json",
    }),
  );
}

module.exports = { r2Ready, backupPunches };
