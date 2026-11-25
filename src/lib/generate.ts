import { generateStudyPack, type GenerateProgress } from './ai';
import { db } from './db';
import { applyStudyPack, setAiStatus } from './repo';

/** Génère (ou régénère) synthèse, Blur-Recall, quiz et script audio d'un cours. */
export async function generateForCourse(
  courseId: string,
  onProgress?: (p: GenerateProgress) => void,
  signal?: AbortSignal,
): Promise<{ cards: number; kept: number; truncated: boolean }> {
  const course = await db.courses.get(courseId);
  if (!course) throw new Error('Cours introuvable');
  const subject = await db.subjects.get(course.subjectId);
  await setAiStatus(courseId, 'pending');
  try {
    const { pack, truncated } = await generateStudyPack({
      text: course.content,
      title: course.title,
      subject: subject?.name,
      onProgress,
      signal,
    });
    const { added, kept } = await applyStudyPack(courseId, pack);
    return { cards: added + kept, kept, truncated };
  } catch (e) {
    await setAiStatus(courseId, 'error');
    throw e;
  }
}

/** Au démarrage : un "pending" local orphelin (onglet fermé en cours de génération) → "none". */
export async function resetStalePending(): Promise<void> {
  await db.courses
    .filter((c) => c.aiStatus === 'pending')
    .modify((c) => {
      c.aiStatus = 'none';
    });
}
