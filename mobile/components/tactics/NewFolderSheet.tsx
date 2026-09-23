import { useState } from 'react';
import { Sheet, Input, Button } from '../ui';

/** Feuille de création d'un dossier de schémas — nom libre, une seule saisie. */
export function NewFolderSheet({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onCreate(trimmed);
      setName('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Nouveau dossier">
      <Input label="Nom du dossier" value={name} onChangeText={setName} placeholder="Ex : Jeu de but" autoFocus />
      <Button label="Créer" onPress={handleCreate} loading={saving} disabled={saving || !name.trim()} block />
    </Sheet>
  );
}
