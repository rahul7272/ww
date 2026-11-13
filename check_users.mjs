import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-marketing');
  const session = await mongoose.connection.db.collection('whatsappsessions').findOne({ sessionId: 'wa_1793865277196_bcjefrc' });
  console.log('Session userId:', session.userId);
  const chatsForThisUser = await mongoose.connection.db.collection('wachats').countDocuments({ sessionId: 'wa_1793865277196_bcjefrc', userId: session.userId });
  console.log('Chats for session and session.userId:', chatsForThisUser);
  const allChatsSession = await mongoose.connection.db.collection('wachats').find({ sessionId: 'wa_1793865277196_bcjefrc' }).toArray();
  console.log('UserIds in wachats for this session:', [...new Set(allChatsSession.map(c => String(c.userId)))]);
  await mongoose.disconnect();
}
main();

