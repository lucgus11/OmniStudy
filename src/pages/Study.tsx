import { PageHeader } from '@/components/ui';
import { QuickStart } from '@/components/QuickStart';

export default function Study() {
  return (
    <>
      <PageHeader title="Réviser" subtitle="Choisis ta durée et ton format : tout est prêt hors-ligne." />
      <QuickStart />
    </>
  );
}
