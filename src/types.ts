export type Source = 'pdf' | 'md' | 'txt' | 'paste';
export type CardType = 'qcm' | 'tf' | 'open' | 'match';
/** 0 = À revoir · 1 = Moyen · 2 = Acquis */
export type Grade = 0 | 1 | 2;
export type Mastery = 0 | 1 | 2;
export type AiStatus = 'none' | 'pending' | 'done' | 'error';
export type SessionMode = 'cards' | 'blur' | 'podcast' | 'voice';
/** Durée / contexte de la session */
export type Pace = 'express' | 'focus' | 'free' | 'urgent';

/** Métadonnées de synchronisation communes à toutes les tables locales */
export interface SyncMeta {
  /** horodatage client de la dernière modification (ms) */
  updatedAt: number;
  /** 1 = à pousser vers Supabase */
  dirty: 0 | 1;
  /** suppression logique (propagée aux autres appareils) */
  deleted: 0 | 1;
}

export interface Subject extends SyncMeta {
  id: string;
  name: string;
  color: string;
  /** midi local du jour de l'examen (ms) */
  examDate: number | null;
  createdAt: number;
}

export interface Keyword {
  term: string;
  definition: string;
}

export interface Course extends SyncMeta {
  id: string;
  subjectId: string;
  title: string;
  source: Source;
  /** texte brut du cours (PDF extrait, .md, .txt ou collé) */
  content: string;
  /** synthèse Markdown ; les termes critiques sont entourés de {{ }} */
  summary: string;
  keywords: Keyword[];
  audioScript: string;
  aiStatus: AiStatus;
  aiGeneratedAt: number | null;
  createdAt: number;
}

export interface MatchPair {
  left: string;
  right: string;
}

export interface Card extends SyncMeta {
  id: string;
  courseId: string;
  subjectId: string;
  type: CardType;
  question: string;
  /** QCM : liste des propositions */
  options: string[];
  /** mini-jeu d'association */
  pairs: MatchPair[];
  /** bonne réponse (texte du bon choix, "Vrai"/"Faux", réponse de référence) */
  answer: string;
  explanation: string;
  critical: boolean;
  origin: 'ai' | 'manual';
  // ── état SRS ──
  ease: number;
  intervalDays: number;
  dueAt: number;
  reps: number;
  lapses: number;
  mastery: Mastery;
  lastReviewedAt: number | null;
  createdAt: number;
}

export interface StudySession extends SyncMeta {
  id: string;
  subjectId: string | null;
  mode: SessionMode;
  pace: Pace;
  durationSec: number;
  reviewed: number;
  correct: number;
  startedAt: number;
}

// ── Sorties de l'IA ──────────────────────────────────────────────────────────
export interface NewCard {
  type: CardType;
  question: string;
  options?: string[];
  pairs?: MatchPair[];
  answer: string;
  explanation: string;
  critical: boolean;
}

export interface StudyPack {
  summary: string;
  keywords: Keyword[];
  audioScript: string;
  cards: NewCard[];
}
