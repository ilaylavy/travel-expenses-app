import { useTranslation } from '@/hooks/useTranslation';

import { Section } from './Section';
import { ToggleRow } from './ToggleRow';

export function AdvancedTogglesSection({
  isRefund,
  setIsRefund,
  isExcluded,
  setIsExcluded,
  isPrivate,
  setIsPrivate,
  isSharedTrip,
  splitEnabled,
  setSplitEnabled,
}: {
  isRefund: boolean;
  setIsRefund: (v: boolean) => void;
  isExcluded: boolean;
  setIsExcluded: (v: boolean) => void;
  isPrivate: boolean;
  setIsPrivate: (v: boolean) => void;
  isSharedTrip: boolean;
  splitEnabled: boolean;
  setSplitEnabled: (v: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <Section title={t('expense.advancedSection')}>
      <ToggleRow
        label={t('expense.refundToggle')}
        hint={t('expense.refundHint')}
        value={isRefund}
        onChange={setIsRefund}
      />
      <ToggleRow
        label={t('expense.excludeToggle')}
        hint={t('expense.excludeHint')}
        value={isExcluded}
        onChange={setIsExcluded}
      />
      {isSharedTrip ? (
        <ToggleRow
          label={t('expense.privateToggle')}
          hint={t('expense.privateHint')}
          value={isPrivate}
          onChange={setIsPrivate}
        />
      ) : null}
      {isSharedTrip ? (
        <ToggleRow
          label={t('split.toggle')}
          value={splitEnabled}
          onChange={setSplitEnabled}
        />
      ) : null}
    </Section>
  );
}
