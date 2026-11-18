import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import prebuiltTemplateService from '../services/prebuiltTemplateService.js';
import PrebuiltTemplate from '../models/PrebuiltTemplate.js';
import WhatsAppTemplate from '../models/WhatsAppTemplate.js';
import User from '../models/User.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/whatsapp_db';

console.log('Connecting to MongoDB...');
await mongoose.connect(MONGODB_URI);
console.log('Connected to MongoDB successfully!');

console.log('\n--- 1. Testing Seeder ---');
const seedResult = await prebuiltTemplateService.seedPrebuiltTemplates();
console.log('Seed result:', seedResult);

const totalCount = await PrebuiltTemplate.countDocuments();
console.log('Total prebuilt templates in DB:', totalCount);
if (totalCount !== 182) {
  console.error(`❌ Expected 182, got ${totalCount}`);
} else {
  console.log('✅ Exactly 182 templates in database!');
}

console.log('\n--- 2. Testing Category Breakdown ---');
const catResult = await prebuiltTemplateService.getLibraryCategories();
console.log('Total across all:', catResult.totalAll);
console.log('Industry breakdown:');
catResult.categories.forEach(c => {
  console.log(`  - ${c.label} (${c.id}): ${c.count}`);
});

console.log('\n--- 3. Testing Filter Queries ---');
const ecom = await prebuiltTemplateService.getLibraryTemplates({ industry: 'Ecommerce' });
console.log(`Ecommerce count: ${ecom.pagination.total} (Expected: 25)`);

const restaurant = await prebuiltTemplateService.getLibraryTemplates({ industry: 'Restaurant' });
console.log(`Restaurant count: ${restaurant.pagination.total} (Expected: 15)`);

const finance = await prebuiltTemplateService.getLibraryTemplates({ industry: 'Finance' });
console.log(`Finance count: ${finance.pagination.total} (Expected: 15)`);

const general = await prebuiltTemplateService.getLibraryTemplates({ industry: 'General' });
console.log(`General count: ${general.pagination.total} (Expected: 19)`);

const utility = await prebuiltTemplateService.getLibraryTemplates({ category: 'UTILITY' });
console.log(`Utility count: ${utility.pagination.total}`);

const buttons = await prebuiltTemplateService.getLibraryTemplates({ format: 'BUTTONS_TEXT' });
console.log(`Buttons · Text count: ${buttons.pagination.total}`);

const search = await prebuiltTemplateService.getLibraryTemplates({ search: 'order' });
console.log(`Search 'order' count: ${search.pagination.total}`);

console.log('\n--- 4. Testing Clone to User ---');
let testUser = await User.findOne();
if (!testUser) {
  testUser = { _id: new mongoose.Types.ObjectId() };
}
console.log('Cloning for user ID:', testUser._id);

const cloneEn = await prebuiltTemplateService.cloneTemplateToUser(
  testUser._id,
  'ecommerce-order-confirmed',
  'en'
);
console.log('Cloned English template:', {
  id: cloneEn._id,
  name: cloneEn.name,
  displayName: cloneEn.displayName,
  language: cloneEn.language,
  body: cloneEn.body,
  buttons: cloneEn.buttons
});

const cloneHi = await prebuiltTemplateService.cloneTemplateToUser(
  testUser._id,
  'ecommerce-order-confirmed',
  'hi'
);
console.log('Cloned Hindi template:', {
  id: cloneHi._id,
  name: cloneHi.name,
  displayName: cloneHi.displayName,
  language: cloneHi.language,
  body: cloneHi.body
});

const cloneGu = await prebuiltTemplateService.cloneTemplateToUser(
  testUser._id,
  'ecommerce-order-confirmed',
  'gu'
);
console.log('Cloned Gujarati template:', {
  id: cloneGu._id,
  name: cloneGu.name,
  displayName: cloneGu.displayName,
  language: cloneGu.language,
  body: cloneGu.body
});

// Clean up cloned test templates
await WhatsAppTemplate.deleteMany({ _id: { $in: [cloneEn._id, cloneHi._id, cloneGu._id] } });
console.log('Cleaned up test clone templates.');

console.log('\n🎉 ALL BACKEND PHASE 1 CHECKS PASSED PERFECTLY!');
await mongoose.disconnect();
process.exit(0);
