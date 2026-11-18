import mongoose from 'mongoose';

const validatorNoteSchema = new mongoose.Schema(
  {
    noteId: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    text: { type: String, required: true, trim: true },
    author: { type: String, default: 'Admin' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const validatorTaskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      default: 'WhatsApp Verification Task',
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    activityNotes: [validatorNoteSchema],
    safetyProfile: {
      type: String,
      enum: ['ultra-safe', 'balanced', 'turbo'],
      default: 'balanced',
    },
    safetyCooldownSeconds: {
      type: Number,
      default: 5,
      min: 0,
      max: 60,
    },
    safetyCooldownEvery: {
      type: Number,
      default: 50,
      min: 10,
      max: 500,
    },
    selectedSessions: [
      {
        sessionId: { type: String, required: true },
        sessionName: { type: String, default: '' },
        phoneNumber: { type: String, default: '' },
      },
    ],
    batchSize: {
      type: Number,
      default: 10,
      min: 1,
      max: 50,
    },
    delaySeconds: {
      type: Number,
      default: 2,
      min: 1,
      max: 30,
    },
    defaultCountryCode: {
      type: String,
      default: '91',
    },
    autoRemoveInvalid: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'paused', 'completed', 'stopped', 'failed'],
      default: 'pending',
      index: true,
    },
    activeDevice: {
      type: String,
      default: '',
    },
    currentBatch: {
      type: Number,
      default: 0,
    },
    totalBatches: {
      type: Number,
      default: 0,
    },
    numbers: [
      {
        phone: { type: String, required: true },
        raw: { type: String, default: '' },
        digits: { type: String, default: '' },
        jid: { type: String, default: '' },
        isValid: { type: Boolean, default: false },
        status: {
          type: String,
          enum: ['pending', 'valid', 'invalid'],
          default: 'pending',
        },
        error: { type: String, default: '' },
        checkedBySessionId: { type: String, default: '' },
        checkedByPhone: { type: String, default: '' },
        processedAt: { type: Date, default: null },
      },
    ],
    stats: {
      total: { type: Number, default: 0 },
      valid: { type: Number, default: 0 },
      invalid: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      progressPercent: { type: Number, default: 0 },
    },
    lastError: {
      type: String,
      default: '',
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

validatorTaskSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model('ValidatorTask', validatorTaskSchema);
