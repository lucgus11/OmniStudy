# OmniStudy

PWA de révision d'examens, **offline-first** : React + Vite + TypeScript + Tailwind, IndexedDB (Dexie), Supabase (auth + sync), Groq (`openai/gpt-oss-120b`) via une fonction serverless Vercel.

## Fonctionnalités

- **Matières** avec date d'examen (compte à rebours J-x, révisions plafonnées à la veille de l'examen)
- **Import** : PDF (plusieurs à la fois, extraction locale pdf.js), `.md`, `.txt`, copier-coller
- **IA** : synthèse hiérarchisée, version Blur-Recall, quiz (QCM, Vrai/Faux, ouvertes, mini-jeu d'association), script audio « mini-podcast »
- **Révision** : Express (2 min), Focus (10 min), Libre, Urgence J-1 (notions faibles + points critiques)
- **Blur-Recall** : termes floutés, clic pour révéler (compté comme indice) ou saisie tolérante aux accents/fautes
- **Audio** : Podcast (1× / 1,25× / 1,5×…) et Interro vocale (question → compte à rebours silencieux configurable → réponse), hors-ligne via les voix locales
- **SRS** : À revoir / Moyen / Acquis → réajuste la fréquence (variante SM-2)
- **Dashboard** : prochains examens, progression, streak, activité 7 jours
- **Sync** : écriture locale instantanée, push/pull automatique au retour du réseau (last-write-wins)

## Mise en route locale

```bash
npm install
cp .env.example .env.local     # puis renseigne les valeurs
npm run dev
```

Sans variables Supabase, l'app fonctionne en **mode 100 % local** (pas de compte, pas d'IA).

> L'IA passe par `/api/ai` (fonction Vercel). En local, utilise `npx vercel dev` au lieu de `npm run dev` pour l'avoir.

Autres commandes : `npm test` (tests unitaires), `npm run build`.

## 1. Supabase

1. Crée un projet sur https://supabase.com.
2. **SQL Editor → New query** : colle tout `supabase/schema.sql` → Run (idempotent, RLS incluse).
3. **Project Settings → API** : copie *Project URL* et la clé *anon public*.
4. **Authentication → URL Configuration** : *Site URL* = ton URL Vercel (ex. `https://omnistudy.vercel.app`), et ajoute-la dans *Redirect URLs* (+ `http://localhost:3000` pour `vercel dev`).
5. (Optionnel, pour tester vite) *Authentication → Providers → Email* : désactive « Confirm email ».

## 2. Groq

Crée une clé sur https://console.groq.com/keys. Elle ne va **que** dans Vercel (jamais préfixée `VITE_`).

## 3. GitHub + Vercel

```bash
git init && git add . && git commit -m "OmniStudy"
git branch -M main
git remote add origin https://github.com/<toi>/omnistudy.git
git push -u origin main
```

Sur https://vercel.com → *Add New → Project* → importe le dépôt (preset Vite détecté). Variables d'environnement (*Settings → Environment Variables*, Production + Preview) :

| Nom | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | clé anon Supabase |
| `GROQ_API_KEY` | clé Groq (serveur uniquement) |
| `GROQ_MODEL` | *(optionnel)* défaut `openai/gpt-oss-120b` |

Déploie (ou redéploie après avoir ajouté les variables : `VITE_*` est injecté au build).

## Installer l'app

Ouvre l'URL sur mobile (Chrome : « Installer l'application » ; Safari iOS : Partager → « Sur l'écran d'accueil »). Au premier chargement, le message « Prêt pour une utilisation hors-ligne » confirme la mise en cache.

## Architecture

```
api/ai.ts            Proxy Groq : vérifie le JWT Supabase, prompt système, JSON strict
supabase/schema.sql  Tables + triggers (last-write-wins) + politiques RLS
src/lib/db.ts        IndexedDB (Dexie) — source de vérité de l'UI
src/lib/sync.ts      Push (dirty) / pull (curseur updated_at), parents avant enfants
src/lib/srs.ts       Répétition espacée + files par rythme (Express/Focus/Libre/Urgence)
src/lib/ai*.ts       Client IA, découpage des longs cours, validation du JSON
src/lib/pdf.ts       Extraction PDF côté client (chargé à la demande)
src/lib/speech.ts    TTS Web Speech (Narrator podcast, interro vocale)
src/components/      CardView, PodcastPlayer, VoiceQuiz, QuickStart, RichText…
src/pages/           Dashboard, Import, Recall (Blur-Recall), Session, AudioPage…
```

## Notes & limites

- **PDF scannés** (images) : aucun texte extractible, un message l'indique (OCR non inclus).
- **Hors-ligne** : tout fonctionne sauf la génération IA, la connexion et la synchro (mises en file d'attente).
- **Voix** : la qualité dépend des voix installées sur l'appareil ; privilégie les voix « locales » pour le hors-ligne. Sur iOS, la lecture doit être lancée par un geste de l'utilisateur.
- **Conflits** : last-write-wins par ligne. Deux appareils modifiant la même carte hors-ligne → la modification la plus récente gagne.
- **Déconnexion** : les données locales sont effacées de l'appareil (elles restent sur le compte).
- **Durée IA** : la fonction est limitée à 60 s par partie de cours (~12 000 caractères) ; les cours longs sont traités partie par partie (max 10 parties).
