/* ============================= LOAD ENV ============================= */
import dotenv from "dotenv";
dotenv.config();

/* ============================= IMPORTS ============================= */
import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { createClient } from "@supabase/supabase-js";
import { format } from "date-fns-tz";

/* ============================= APP ============================= */
const app = express();

/* ============================= SUPABASE CLIENT ============================= */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

/* ============================= CORS ============================= */
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options("*", cors());
app.use(express.json());

/* ============================= IN-MEMORY TOURNAMENT ============================= */
let tournamentJoins = [];
let tournamentRooms = {};

/* ============================= HEALTH ============================= */
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    joins: tournamentJoins.length,
    time: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
  });
});

/* ============================= TOURNAMENT SYSTEM ============================= */
app.post("/api/join-tournament", (req, res) => {
  const data = req.body;
  if (!data.bgmiId || !data.tournamentId)
    return res.status(400).json({ success: false });

  const alreadyJoined = tournamentJoins.find(
    j => j.tournamentId === data.tournamentId && j.bgmiId === data.bgmiId
  );
  if (alreadyJoined)
    return res.json({ success: false, message: "Already joined" });

  if (tournamentJoins.filter(j => j.tournamentId === data.tournamentId).length >= 2)
    return res.json({ success: false, message: "Slots full" });

  tournamentJoins.push({
    id: nanoid(),
    ...data,
    status: "Registered",
    joinedAt: new Date().toISOString()
  });

  res.json({ success: true });
});

app.get("/api/check-join/:tournamentId", (req, res) => {
  const joined = tournamentJoins.some(
    j => j.tournamentId === req.params.tournamentId && j.bgmiId === req.query.bgmiId
  );
  res.json({ joined });
});

app.get("/api/tournament-slots-count/:tournamentId", (req, res) => {
  res.json({
    registered: tournamentJoins.filter(j => j.tournamentId === req.params.tournamentId).length,
    max: 2
  });
});

app.get("/api/admin/joins", (req, res) => {
  res.json({
    tournamentJoins: tournamentJoins.map(j => ({
      ...j,
      roomId: tournamentRooms[j.tournamentId]?.roomId || "",
      roomPassword: tournamentRooms[j.tournamentId]?.roomPassword || ""
    }))
  });
});

app.put("/api/admin/set-room-by-tournament", (req, res) => {
  tournamentRooms[req.body.tournamentId] = {
    roomId: req.body.roomId,
    roomPassword: req.body.roomPassword
  };
  res.json({ success: true });
});

app.delete("/api/admin/tournament/:id", (req, res) => {
  tournamentJoins = tournamentJoins.filter(j => j.id !== req.params.id);
  res.json({ success: true });
});

app.get("/api/my-matches", (req, res) => {
  res.json({
    matches: tournamentJoins.filter(j => j.bgmiId === req.query.bgmiId)
  });
});

/* ============================= DEPOSIT → SUPABASE ============================= */
app.post("/api/deposit", async (req, res) => {
  const { profileId, username, email, amount, utr } = req.body;

  if (!profileId || !amount || !utr) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    const nowUTC = new Date().toISOString();
    const nowIST = format(new Date(), "dd/MM/yyyy, hh:mm:ss a", { timeZone: "Asia/Kolkata" });

    const { data, error } = await supabase
      .from("DepositUser")
      .insert([{
        profile_id: profileId.toString(),
        name: username || "Unknown",
        email: email || "no-email",
        amount: Number(amount),
        utr: utr.toString(),
        status: 'pending',
        date: nowUTC,
        date_ist: nowIST
      }])
      .select()
      .single();

    if (error) {
      console.error("❌ SUPABASE ERROR:", error);
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({ success: true, deposit: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ADMIN STATUS UPDATE
app.put("/api/admin/deposit-status/:id", async (req, res) => {
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ success: false, message: "Status required" });
  }

  try {
    const { data, error } = await supabase
      .from("DepositUser")
      .update({ status })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) {
      console.error("❌ STATUS UPDATE ERROR:", error);
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({ success: true, deposit: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ NEW ENDPOINT - ADMIN DELETE DEPOSIT
app.delete("/api/admin/deposit/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("DepositUser")
      .delete()
      .eq("id", req.params.id);

    if (error) {
      console.error("❌ DELETE ERROR:", error);
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* USER DEPOSIT HISTORY */
app.get("/api/deposits", async (req, res) => {
  const { data, error } = await supabase
    .from("DepositUser")
    .select("*")
    .order("date", { ascending: false });

  if (error) return res.json({ deposits: [] });
  res.json({ deposits: data });
});

/* ADMIN – ALL DEPOSITS */
app.get("/api/admin/deposits", async (req, res) => {
  const { data } = await supabase
    .from("DepositUser")
    .select("*")
    .order("date", { ascending: false });

  res.json({ deposits: data || [] });
});

/* ============================= SERVER START ============================= */
const PORT = process.env.PORT || 5002;
app.listen(PORT, "0.0.0.0", () => {
  console.log("🔥 BGMI Server running on port", PORT);
  console.log("✅ Health: /health");
  console.log("✅ Deposit → Supabase connected");
  console.log("✅ Status update: PUT /api/admin/deposit-status/:id");
  console.log("✅ Delete deposit: DELETE /api/admin/deposit/:id");
});
