const express = require("express");
const { dispatch, STAFF } = require("./server/api");
const store = require("./server/store");
const google = require("./server/google");

const app = express();
const root = __dirname;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

async function handleApi(req, res) {
  try {
    let body = req.body && Object.keys(req.body).length ? req.body : {};
    if (req.query && req.query.payload) {
      body = JSON.parse(String(req.query.payload));
    }
    const data = await dispatch(body);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

app.post("/api", handleApi);
app.get("/api", handleApi);

app.use(
  express.static(root, {
    etag: false,
    maxAge: 0,
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-cache");
    },
  }),
);

const port = Number(process.env.PORT) || 3000;

store
  .ready()
  .then(() => store.importIfEmpty(() => google.importFromGoogle(STAFF)))
  .catch((err) => console.error("startup import", err && err.message ? err.message : err))
  .finally(() => {
    app.listen(port, () => {
      console.log("staff-punch listening on " + port);
    });
  });
