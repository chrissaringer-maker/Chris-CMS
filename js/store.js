// Datenzugriff auf Fachebene: lädt und speichert zusammengehörige Datensätze.
import * as db from './db.js';
import { createMeeting, seriesOf } from './model.js';

export const listProjects = async () =>
  (await db.getAll('projects')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export const getProject = (id) => db.get('projects', id);

export async function saveProject(project) {
  project.updatedAt = new Date().toISOString();
  await db.put('projects', project);
}

// Alles, was eine Projekt- oder Besprechungsansicht braucht.
export async function loadBundle(projectId) {
  const [project, meetings, items, attachments] = await Promise.all([
    db.get('projects', projectId),
    db.getAllBy('meetings', 'projectId', projectId),
    db.getAllBy('items', 'projectId', projectId),
    db.getAllBy('attachments', 'projectId', projectId),
  ]);
  return { project, meetings, items, attachments };
}

export async function startMeeting(bundle, type) {
  const { meeting, items } = createMeeting({ ...bundle, type });
  await db.put('meetings', meeting);
  if (items.length) await db.put('items', ...items);
  await touch(bundle.project);
  return meeting;
}

export const saveMeeting = (meeting) => {
  meeting.updatedAt = new Date().toISOString();
  return db.put('meetings', meeting);
};

export const saveItem = (item) => db.put('items', item);
export const saveItems = (...items) => (items.length ? db.put('items', ...items) : Promise.resolve());
export const saveAttachment = (att) => db.put('attachments', att);
export const getAttachment = (id) => db.get('attachments', id);

export async function deleteItem(item) {
  const ids = item.log.flatMap((e) => e.attachmentIds ?? []);
  await db.del('items', item.id);
  if (ids.length) await db.del('attachments', ...ids);
}

// Nur die jüngste, noch nicht abgeschlossene Sitzung einer Reihe darf gelöscht werden.
export function canDeleteMeeting(bundle, meeting) {
  const series = seriesOf(bundle.meetings, meeting.projectId, meeting.type);
  return series.at(-1)?.id === meeting.id && meeting.status !== 'endfassung' && !meeting.finals?.length;
}

export async function deleteMeeting(bundle, meeting) {
  const removeItems = [];
  const updateItems = [];
  const removeAtts = [...(meeting.attachmentIds ?? [])];
  for (const item of bundle.items) {
    const own = item.log.find((e) => e.meetingId === meeting.id);
    if (!own) continue;
    removeAtts.push(...(own.attachmentIds ?? []));
    if (item.createdMeetingId === meeting.id) removeItems.push(item.id);
    else updateItems.push({ ...item, log: item.log.filter((e) => e.meetingId !== meeting.id) });
  }
  if (removeItems.length) await db.del('items', ...removeItems);
  if (updateItems.length) await db.put('items', ...updateItems);
  if (removeAtts.length) await db.del('attachments', ...removeAtts);
  await db.del('meetings', meeting.id);
}

export async function deleteProject(projectId) {
  const b = await loadBundle(projectId);
  await db.del('meetings', ...b.meetings.map((m) => m.id));
  await db.del('items', ...b.items.map((i) => i.id));
  await db.del('attachments', ...b.attachments.map((a) => a.id));
  await db.del('projects', projectId);
}

async function touch(project) {
  project.updatedAt = new Date().toISOString();
  await db.put('projects', project);
}

export const getMeeting = (id) => db.get('meetings', id);
export const deleteAttachment = (id) => db.del('attachments', id);
