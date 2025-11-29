/**
 * Task Scheduler
 * 
 * Manages scheduled tasks using Chrome's alarms API.
 * Handles task persistence, scheduling, and triggering.
 */

import type { ScheduledTask, TaskRepeatType } from './types';

// Storage key for tasks
const TASKS_STORAGE_KEY = 'eidolon_scheduled_tasks';

// Alarm name prefix
const ALARM_PREFIX = 'eidolon_task_';

/**
 * Get all scheduled tasks
 */
export async function getTasks(): Promise<ScheduledTask[]> {
  const result = await chrome.storage.local.get(TASKS_STORAGE_KEY);
  return result[TASKS_STORAGE_KEY] || [];
}

/**
 * Save tasks to storage
 */
async function saveTasks(tasks: ScheduledTask[]): Promise<void> {
  await chrome.storage.local.set({ [TASKS_STORAGE_KEY]: tasks });
}

/**
 * Generate unique task ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Calculate next run time based on repeat type
 */
function calculateNextRunTime(
  repeatType: TaskRepeatType,
  fromTime: number = Date.now()
): number | undefined {
  if (repeatType === 'none') return undefined;
  
  const date = new Date(fromTime);
  
  switch (repeatType) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'annually':
      date.setFullYear(date.getFullYear() + 1);
      break;
  }
  
  return date.getTime();
}

/**
 * Create a new scheduled task
 */
export async function createTask(
  name: string,
  prompt: string,
  options: {
    url?: string;
    model?: string;
    repeatType?: TaskRepeatType;
    scheduledTime?: number;
    enabled?: boolean;
  } = {}
): Promise<ScheduledTask> {
  const tasks = await getTasks();
  const now = Date.now();
  
  const task: ScheduledTask = {
    id: generateTaskId(),
    name,
    prompt,
    url: options.url,
    model: options.model,
    enabled: options.enabled !== false,
    repeatType: options.repeatType || 'none',
    scheduledTime: options.scheduledTime,
    nextRunTime: options.scheduledTime || calculateNextRunTime(options.repeatType || 'none'),
    createdAt: now,
    updatedAt: now
  };
  
  tasks.push(task);
  await saveTasks(tasks);
  
  // Schedule alarm if task is enabled and has a scheduled time
  if (task.enabled && task.nextRunTime) {
    await scheduleAlarm(task);
  }
  
  console.log(`[Scheduler] Created task: ${task.id}`);
  return task;
}

/**
 * Update a task
 */
export async function updateTask(
  taskId: string,
  updates: Partial<Omit<ScheduledTask, 'id' | 'createdAt'>>
): Promise<ScheduledTask | null> {
  const tasks = await getTasks();
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  
  if (taskIndex === -1) {
    return null;
  }
  
  const task = tasks[taskIndex];
  Object.assign(task, updates, { updatedAt: Date.now() });
  
  await saveTasks(tasks);
  
  // Update alarm
  await chrome.alarms.clear(`${ALARM_PREFIX}${taskId}`);
  if (task.enabled && task.nextRunTime) {
    await scheduleAlarm(task);
  }
  
  return task;
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string): Promise<void> {
  const tasks = await getTasks();
  const filteredTasks = tasks.filter(t => t.id !== taskId);
  
  if (filteredTasks.length !== tasks.length) {
    await saveTasks(filteredTasks);
    await chrome.alarms.clear(`${ALARM_PREFIX}${taskId}`);
    console.log(`[Scheduler] Deleted task: ${taskId}`);
  }
}

/**
 * Get a task by ID
 */
export async function getTask(taskId: string): Promise<ScheduledTask | null> {
  const tasks = await getTasks();
  return tasks.find(t => t.id === taskId) || null;
}

/**
 * Enable/disable a task
 */
export async function setTaskEnabled(taskId: string, enabled: boolean): Promise<void> {
  await updateTask(taskId, { enabled });
}

/**
 * Schedule an alarm for a task
 */
async function scheduleAlarm(task: ScheduledTask): Promise<void> {
  if (!task.nextRunTime) return;
  
  const alarmName = `${ALARM_PREFIX}${task.id}`;
  
  // Clear any existing alarm
  await chrome.alarms.clear(alarmName);
  
  // Schedule new alarm
  await chrome.alarms.create(alarmName, {
    when: task.nextRunTime
  });
  
  console.log(`[Scheduler] Scheduled alarm for task ${task.id} at ${new Date(task.nextRunTime).toISOString()}`);
}

/**
 * Handle alarm trigger
 */
export async function handleAlarm(alarmName: string): Promise<ScheduledTask | null> {
  if (!alarmName.startsWith(ALARM_PREFIX)) {
    return null;
  }
  
  const taskId = alarmName.replace(ALARM_PREFIX, '');
  const task = await getTask(taskId);
  
  if (!task || !task.enabled) {
    return null;
  }
  
  console.log(`[Scheduler] Alarm triggered for task: ${taskId}`);
  
  // Update last run time
  const now = Date.now();
  const nextRunTime = calculateNextRunTime(task.repeatType, now);
  
  await updateTask(taskId, {
    lastRunTime: now,
    nextRunTime
  });
  
  return task;
}

/**
 * Get enabled tasks that are due to run
 */
export async function getDueTasks(): Promise<ScheduledTask[]> {
  const tasks = await getTasks();
  const now = Date.now();
  
  return tasks.filter(task => 
    task.enabled && 
    task.nextRunTime && 
    task.nextRunTime <= now
  );
}

/**
 * Initialize scheduler - restore alarms for all enabled tasks
 */
export async function initScheduler(): Promise<void> {
  const tasks = await getTasks();
  
  for (const task of tasks) {
    if (task.enabled && task.nextRunTime && task.nextRunTime > Date.now()) {
      await scheduleAlarm(task);
    }
  }
  
  console.log(`[Scheduler] Initialized with ${tasks.filter(t => t.enabled).length} active tasks`);
}

/**
 * Run a task immediately (for testing or manual trigger)
 */
export async function runTaskNow(taskId: string): Promise<void> {
  const task = await getTask(taskId);
  
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  
  // Send message to execute task
  await chrome.runtime.sendMessage({
    action: 'execute-scheduled-task',
    taskId: task.id
  });
}

/**
 * Get upcoming tasks
 */
export async function getUpcomingTasks(limit: number = 10): Promise<ScheduledTask[]> {
  const tasks = await getTasks();
  const now = Date.now();
  
  return tasks
    .filter(task => task.enabled && task.nextRunTime && task.nextRunTime > now)
    .sort((a, b) => (a.nextRunTime || 0) - (b.nextRunTime || 0))
    .slice(0, limit);
}

/**
 * Get recently run tasks
 */
export async function getRecentlyRunTasks(limit: number = 10): Promise<ScheduledTask[]> {
  const tasks = await getTasks();
  
  return tasks
    .filter(task => task.lastRunTime)
    .sort((a, b) => (b.lastRunTime || 0) - (a.lastRunTime || 0))
    .slice(0, limit);
}

// Setup alarm listener if in background context
if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    const task = await handleAlarm(alarm.name);
    if (task) {
      // Notify that a task should be executed
      chrome.runtime.sendMessage({
        action: 'execute-scheduled-task',
        taskId: task.id
      }).catch(() => {
        // Message might fail if no listeners, that's ok
      });
    }
  });
}
