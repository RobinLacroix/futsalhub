import { supabase } from '../supabaseClient';
import { schematicsService, type SchematicRecord } from './schematicsService';

/** "Phase de jeu" à l'affichage (cf recadrage 2026-09-22) — colonne toujours `theme` en base. */
export type TrainingProcedureTheme = 'Offensif' | 'Defensif' | 'Transition' | 'CPA' | 'Powerplay';
/** "Format" à l'affichage — colonne toujours `type` en base. */
export type TrainingProcedureType = 'Echauffement' | 'Exercice' | 'Situation' | 'Jeu' | 'Rondo/Toro';
export type TrainingProcedureIntensite = 'Légère' | 'Modérée' | 'Haute';

/** Une entrée de `mecanismes` : une règle et ce qu'elle induit comme comportement, sans consigne verbale (cf skill futsal-coach, levier 6). */
export interface MecanismeInducteur {
  regle: string;
  induit: string;
}

export interface TrainingProcedureRecord {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  objectives: string;
  instructions: string;
  /** @deprecated remplacé par `variables_plus`/`variables_moins`, conservé pour compat des fiches existantes. */
  variants: string | null;
  /** @deprecated remplacé par `comportements` (liste), conservé pour compat des fiches existantes. */
  corrections: string | null;
  theme: TrainingProcedureTheme;
  type: TrainingProcedureType;
  min_players: number | null;
  field_dimensions: string | null;
  duration_minutes: number | null;
  image_url: string | null;
  schematic_id: string | null;
  bloc: string | null;
  /** Dossier de la bibliothèque — organise les procédés depuis le recadrage 2026-09-22 (avant : les schémas). */
  folder_id: string | null;
  /** @deprecated remplacé par `principes` (tags), conservé pour compat des fiches existantes. */
  principe: string | null;
  principes: string[];
  /** @deprecated ancienne "phase d'apprentissage" (1/2/Mix), sortie des formulaires — `theme` porte désormais la phase de jeu. */
  phase: string | null;
  rapport_numerique: string | null;
  question_debriefing: string | null;
  intensite: TrainingProcedureIntensite | null;
  /** "Phase de jeu à faire émerger" — précision libre au-delà de l'enum `theme` (ex: "sortie de pression sous bloc haut"). */
  phase_cible: string | null;
  scoring: string[];
  comportements: string[];
  mecanismes: MecanismeInducteur[];
  variables_plus: string[];
  variables_moins: string[];
  share_code: string | null;
  archived_at: string | null;
  club_id: string;
  created_by: string | null;
  is_public: boolean;
}

/** Champs acceptés en création/mise à jour — id absent = création. */
export type ProcedureUpsertInput = Partial<
  Omit<TrainingProcedureRecord, 'id' | 'created_at' | 'updated_at' | 'archived_at' | 'created_by' | 'is_public' | 'share_code'>
> & {
  id?: string;
  club_id: string;
  title: string;
  objectives: string;
  instructions: string;
  type: TrainingProcedureType;
  theme: TrainingProcedureTheme;
};

/** Un procédé de la bibliothèque, avec son schéma s'il en a un — carte de la grille (cf recadrage 2026-09-22 : une seule bibliothèque, un seul format de carte). */
export interface ProcedureLibraryItem extends TrainingProcedureRecord {
  schematic: SchematicRecord | null;
}

/**
 * Une carte de la bibliothèque — soit un procédé (avec ou sans schéma),
 * soit un schéma qui n'a PAS (encore) de fiche liée. Les deux cas existent
 * (croquis tactique pur vs fiche pédagogique complète, cf conversation
 * 2026-09-22) : masquer les seconds ferait disparaître des schémas déjà
 * dessinés de la bibliothèque — c'est exactement le bug que ça a causé la
 * première fois que getLibraryByClub ne listait que les procédés.
 */
export interface LibraryCard {
  key: string;
  kind: 'procedure' | 'schematic';
  title: string;
  bloc: string | null;
  theme: TrainingProcedureTheme | null;
  folder_id: string | null;
  updated_at: string;
  schematic: SchematicRecord | null;
  procedure: ProcedureLibraryItem | null;
}

export const trainingProceduresService = {
  /**
   * Récupère les fiches procédures actives du club (lecture seule — la
   * création/édition de fiches reste hors scope de l'assembleur de séance,
   * cf. SPEC_ASSEMBLEUR_SEANCE_PHASE2_2026-09.md §6).
   */
  async getProceduresByClub(clubId: string): Promise<TrainingProcedureRecord[]> {
    const { data, error } = await supabase
      .from('training_procedures')
      .select('*')
      .eq('club_id', clubId)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /** Une fiche par son id — utilisé pour précharger un procédé sans schéma dans l'éditeur (cf schematics/page.tsx, ?procedure=). */
  async getProcedureById(id: string): Promise<TrainingProcedureRecord | null> {
    const { data, error } = await supabase.from('training_procedures').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },

  /**
   * La fiche liée à un schéma, s'il y en a une — un schéma peut exister sans
   * fiche (croquis tactique pur, cf recadrage 2026-09-22 avec Robin). Relation
   * traitée comme 1:1 (premier match) : c'est le sens d'usage réel depuis
   * l'éditeur, qui édite "la" fiche du schéma en cours.
   */
  async getProcedureBySchematicId(schematicId: string): Promise<TrainingProcedureRecord | null> {
    const { data, error } = await supabase
      .from('training_procedures')
      .select('*')
      .eq('schematic_id', schematicId)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Crée ou met à jour une fiche procédé — utilisé par le panneau "Séance &
   * données" de l'éditeur (via le pont postMessage, cf schematics/page.tsx)
   * ET par le formulaire de la bibliothèque (ProcedureDrawer), pour ne pas
   * dupliquer la logique de sauvegarde entre les deux points d'entrée qui
   * écrivent désormais dans la même table.
   */
  async createOrUpdateProcedure(input: ProcedureUpsertInput): Promise<TrainingProcedureRecord> {
    const payload = { ...input };
    delete (payload as { id?: string }).id;

    if (input.id) {
      const { data, error } = await supabase
        .from('training_procedures')
        .update(payload)
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await supabase.from('training_procedures').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },

  /**
   * La bibliothèque unifiée : tous les procédés actifs du club, chacun avec
   * son schéma joint s'il en a un (vignette de carte). Remplace l'usage de
   * schematicsService.getSchematicsByClub pour le panneau "Bibliothèque" —
   * schémas bruts et fiches ne sont plus deux listes séparées.
   */
  async getLibraryByClub(clubId: string): Promise<ProcedureLibraryItem[]> {
    const { data, error } = await supabase
      .from('training_procedures')
      .select('*, schematic:schematics(*)')
      .eq('club_id', clubId)
      .is('archived_at', null)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data || []) as unknown as ProcedureLibraryItem[];
  },

  /**
   * LA bibliothèque, complète : procédés (avec leur schéma joint) + schémas
   * qui n'ont encore aucune fiche liée. Sans cette union, un schéma dessiné
   * sans jamais avoir été rattaché à une fiche disparaissait purement et
   * simplement de la bibliothèque (cf conversation 2026-09-22, "j'ai perdu
   * mes schémas").
   */
  async getFullLibraryByClub(clubId: string): Promise<LibraryCard[]> {
    const [procedures, schematics] = await Promise.all([
      this.getLibraryByClub(clubId),
      schematicsService.getSchematicsByClub(clubId),
    ]);

    const linkedSchematicIds = new Set(procedures.map((p) => p.schematic_id).filter((id): id is string => !!id));
    const orphanSchematics = schematics.filter((s) => !linkedSchematicIds.has(s.id));

    const procCards: LibraryCard[] = procedures.map((p) => ({
      key: `p:${p.id}`,
      kind: 'procedure',
      title: p.title,
      bloc: p.bloc,
      theme: p.theme,
      folder_id: p.folder_id,
      updated_at: p.updated_at,
      schematic: p.schematic,
      procedure: p,
    }));
    const schemaCards: LibraryCard[] = orphanSchematics.map((s) => ({
      key: `s:${s.id}`,
      kind: 'schematic',
      title: s.name,
      bloc: null,
      theme: null,
      folder_id: s.folder_id,
      updated_at: s.updated_at,
      schematic: s,
      procedure: null,
    }));

    return [...procCards, ...schemaCards].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  },

  /** Range (ou dérange, folderId = null) un procédé dans un dossier. */
  async setProcedureFolder(id: string, folderId: string | null): Promise<void> {
    const { error } = await supabase.from('training_procedures').update({ folder_id: folderId }).eq('id', id);
    if (error) throw error;
  },

  /** Archive un procédé (jamais de suppression dure) — le schéma lié, s'il y en a un, n'est pas touché. */
  async archiveProcedure(id: string): Promise<void> {
    const { error } = await supabase
      .from('training_procedures')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  /** Duplique un procédé (même dossier, titre suffixé) — copie indépendante, pas de lien vers le schéma d'origine. */
  async duplicateProcedure(id: string): Promise<TrainingProcedureRecord> {
    const { data: source, error: fetchError } = await supabase
      .from('training_procedures')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    const copy = { ...source } as Partial<TrainingProcedureRecord> & { id?: string };
    delete copy.id;
    delete (copy as { created_at?: string }).created_at;
    delete (copy as { updated_at?: string }).updated_at;
    delete (copy as { share_code?: string | null }).share_code;
    copy.title = (copy.title || 'Sans titre') + ' (copie)';
    copy.schematic_id = null; // la copie n'hérite pas du dessin, pour ne pas laisser deux fiches pointer sur le même schéma

    const { data, error } = await supabase.from('training_procedures').insert([copy]).select().single();
    if (error) throw error;
    return data;
  },
};
