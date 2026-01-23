import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";

const app = express();
app.use(cors());
app.use(express.json());

/* ============================= IN-MEMORY DATABASE ============================= */
let tournamentJoins = [];
let tournamentRooms = {};
let deposits = [];

/* ============================= JOIN TOURNAMENT (USER) ============================= */
app.post("/api/join-tournament", (req, res) => {
const data = req.body;

if (!data.bgmiId || !data.tournamentId) {
return res.status(400).json({ success: false, message: "Invalid data" });
}

const alreadyJoined = tournamentJoins.find(
j => j.tournamentId === data.tournamentId && j.bgmiId === data.bgmiId
);
if (alreadyJoined) {
return res.json({ success: false, message: "Already joined" });
}

const joinedCount = tournamentJoins.filter(
j => j.tournamentId === data.tournamentId
).length;

if (joinedCount >= 2) {
return res.json({ success: false, message: "Slots full" });
}

tournamentJoins.push({
id: nanoid(),
tournamentId: data.tournamentId,
tournamentName: data.tournamentName,
date: data.date,
time: data.time,
entryFee: data.entryFee,
prizePool: data.prizePool,
playerName: data.playerName,
bgmiId: data.bgmiId,
status: "Registered",
joinedAt: new Date().toISOString(),
});

res.json({ success: true });
});

/* ============================= CHECK JOIN STATUS ============================= */
app.get("/api/check-join/:tournamentId", (req, res) => {
const { tournamentId } = req.params;
const { bgmiId } = req.query;

if (!bgmiId) return res.json({ joined: false });

const joined = tournamentJoins.some(
j => j.tournamentId === tournamentId && j.bgmiId === bgmiId
);

res.json({ joined });
});

/* ============================= SLOT COUNT ============================= */
app.get("/api/tournament-slots-count/:tournamentId", (req, res) => {
const { tournamentId } = req.params;
const registered = tournamentJoins.filter(
j => j.tournamentId === tournamentId
).length;

res.json({ registered, max: 2 });
});

/* ============================= ADMIN – GET ALL JOINS ============================= */
app.get("/api/admin/joins", (req, res) => {
const data = tournamentJoins.map(j => ({
...j,
roomId: tournamentRooms[j.tournamentId]?.roomId || "",
roomPassword: tournamentRooms[j.tournamentId]?.roomPassword || "",
}));

res.json({ tournamentJoins: data });
});

/* ============================= ADMIN – SET ROOM ============================= */
app.put("/api/admin/set-room-by-tournament", (req, res) => {
const { tournamentId, roomId, roomPassword } = req.body;

if (!tournamentId) {
return res.status(400).json({ success: false });
}

tournamentRooms[tournamentId] = { roomId, roomPassword };
res.json({ success: true });
});

/* ============================= ADMIN – DELETE USER ============================= */
app.delete("/api/admin/tournament/:id", (req, res) => {
const { id } = req.params;
tournamentJoins = tournamentJoins.filter(j => j.id !== id);
res.json({ success: true });
});

/* ============================= USER – MY MATCHES ============================= */
app.get("/api/my-matches", (req, res) => {
const { bgmiId } = req.query;
if (!bgmiId) return res.json({ matches: [] });

const matches = tournamentJoins
.filter(j => j.bgmiId === bgmiId)
.map(j => ({
...j,
roomId: tournamentRooms[j.tournamentId]?.roomId || "",
roomPassword: tournamentRooms[j.tournamentId]?.roomPassword || "",
}));

res.json({ matches });
});

/* 🔥 FIXED DEPOSIT CREATE - EMAIL SUPPORT */
app.post("/api/deposit", (req, res) => {
const { profileId, bgmiDisplayId, username, email, amount, utr, timestamp } = req.body;

console.log("🧾 DEPOSIT REQUEST:", req.body);

if (!profileId || !amount || !utr) {
return res.status(400).json({
success: false,
message: "profileId, amount, and utr are required"
});
}

const now = new Date();
const newDeposit = {
depositId: nanoid(),
profileId: profileId.toString(),
bgmiDisplayId: bgmiDisplayId || null,
username: username || "Unknown",
email: email || "No email provided", // ✅ FIXED - Default value
amount: Number(amount),
utr: utr.toString(),
status: "pending",
createdAt: now.toISOString(),
timestamp: timestamp || now.toISOString(),
approvedAt: null,
};

deposits.push(newDeposit);
console.log("✅ NEW DEPOSIT ADDED:", newDeposit);
res.json({ success: true, deposit: newDeposit });
});

/* 🔥 ADMIN DEPOSITS - INDIAN TIME */
app.get("/api/admin/deposits", (req, res) => {
console.log("📊 Total deposits:", deposits.length);
console.log("📧 Sample email:", deposits[0]?.email); // ✅ DEBUG LOG

const indianDeposits = deposits.map(deposit => ({
...deposit,
createdAtIndian: new Date(deposit.createdAt).toLocaleString('en-IN', {
timeZone: 'Asia/Kolkata',
day: 'numeric',
month: 'short',
year: 'numeric',
hour: '2-digit',
minute: '2-digit',
hour12: true
}),
approvedAtIndian: deposit.approvedAt ? new Date(deposit.approvedAt).toLocaleString('en-IN', {
timeZone: 'Asia/Kolkata',
day: 'numeric',
month: 'short',
year: 'numeric',
hour: '2-digit',
minute: '2-digit',
hour12: true
}) : null
}));

res.json({ deposits: indianDeposits });
});

/* 🔥 DEPOSIT STATUS UPDATE */
app.put("/api/admin/deposit-status", (req, res) => {
const { depositId, status } = req.body;

const deposit = deposits.find(d => d.depositId === depositId);
if (!deposit) {
return res.status(404).json({ success: false, message: "Deposit not found" });
}

deposit.status = status;
deposit.approvedAt = status === "approved" ? new Date().toISOString() : null;

console.log(`✅ Deposit ${depositId} updated to ${status}`);
res.json({ success: true, deposit });
});

/* ============================= SERVER START ============================= */
const PORT = 5002;
app.listen(PORT, () => {
console.log("🔥 BGMI Server running on port", PORT);
});