/**
 * Task Types
 * 
 * Type definitions for the task scheduling and execution system.
 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskRepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'annually';

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  url?: string;
  model?: string;
  enabled: boolean;
  skipPermissions?: boolean;
  repeatType: TaskRepeatType;
  scheduledTime?: number; // Unix timestamp
  lastRunTime?: number;
  nextRunTime?: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskRun {
  id: string;
  taskId: string;
  status: TaskStatus;
  startTime: number;
  endTime?: number;
  result?: any;
  error?: string;
  actions?: TaskAction[];
}

export interface TaskAction {
  type: string;
  target?: string;
  value?: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

export interface TaskPlan {
  id: string;
  taskId?: string;
  items: TaskPlanItem[];
  createdAt: number;
  updatedAt: number;
}

export interface TaskPlanItem {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  order: number;
}

export interface TaskExecutionContext {
  tabId: number;
  windowId: number;
  sessionId?: string;
  task: ScheduledTask;
  run: TaskRun;
  plan?: TaskPlan;
}
