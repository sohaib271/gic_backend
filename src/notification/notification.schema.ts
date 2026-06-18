/**
 * 📋 NOTIFICATION SCHEMA
 * ======================
 * MongoDB collection: notifications
 *
 * Purpose: Store all notifications sent to users
 * Each notification belongs to ONE user only
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Document type for TypeScript
export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  // ============================================================
  // CORE FIELDS
  // ============================================================

  /**
   * userId - KON user ko notification jayegi?
   * Har notification sirf ek user ke liye hai
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /**
   * senderId - KON ne notification bheji?
   * Usually admin/teacher ka userId hoga
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  /**
   * senderName - Sender ka naam (for quick display)
   */
  @Prop({ required: true })
  senderName: string;

  /**
   * senderRole - Sender ka role (admin/hod/teacher)
   */
  @Prop({ required: true })
  senderRole: string;

  // ============================================================
  // NOTIFICATION CONTENT
  // ============================================================

  /**
   * type - Notification ka type
   * Values: announcement | attendance | qr | class | general
   */
  @Prop({ required: true, enum: ['announcement', 'attendance', 'qr', 'class', 'general'] })
  type: string;

  /**
   * title - Notification ka title
   * Example: "New Announcement", "Attendance Marked"
   */
  @Prop({ required: true })
  title: string;

  /**
   * message - Notification ka message/body
   * Example: "Final exam scheduled for 20th July"
   */
  @Prop({ required: true })
  message: string;

  // ============================================================
  // EXTRA DATA (for navigation/deep linking)
  // ============================================================

  /**
   * data - Additional data for navigation
   * Example: { announcementId: "...", classId: "..." }
   * Flutter app isko use karega notification pe tap karne ke liye
   */
  @Prop({ type: Object, default: {} })
  data: Record<string, any>;

  /**
   * classNames - Konsi classes ko target kiya gaya (for filtering)
   * Example: ["ICS-2426-PB7-I", "BS-IT-2428-CS1-IV"]
   */
  @Prop({ type: [String], default: [] })
  classNames: string[];

  // ============================================================
  // READ STATUS
  // ============================================================

  /**
   * isRead - Kya notification padh liya hai?
   * Default: false (unread)
   */
  @Prop({ default: false, index: true })
  isRead: boolean;

  /**
   * readAt - Kab padha (timestamp)
   */
  @Prop({ type: Date })
  readAt: Date;
}

// Export schema for MongoDB
export const NotificationSchema = SchemaFactory.createForClass(Notification);

// ============================================================
// INDEXES - For fast queries
// ============================================================

// Compound index for getting user's notifications
NotificationSchema.index({ userId: 1, createdAt: -1 });

// Index for unread count query
NotificationSchema.index({ userId: 1, isRead: 1 });
