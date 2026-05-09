import { useState } from 'react';

import { CalendarPickerModal } from '@/components/ui/CalendarPickerModal';
import { useTranslation } from '@/hooks/useTranslation';

import { DateSection } from './DateSection';
import { Section } from './Section';

export function DateTimeSection({
  date,
  time,
  isSpread,
  spreadStart,
  spreadEnd,
  amountValue,
  currency,
  onDateChange,
  onTimeChange,
  onTimeFocus,
  onEnterSpread,
  onExitSpread,
  onSpreadRangeChange,
}: {
  date: string;
  time: string;
  isSpread: boolean;
  spreadStart: string;
  spreadEnd: string;
  amountValue: number;
  currency: string;
  onDateChange: (d: string) => void;
  onTimeChange: (v: string) => void;
  onTimeFocus: () => void;
  onEnterSpread: () => void;
  onExitSpread: () => void;
  onSpreadRangeChange: (start: string, end: string) => void;
}) {
  const { t } = useTranslation();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [spreadPickerOpen, setSpreadPickerOpen] = useState(false);

  return (
    <>
      <Section title={t('expense.dateTimeSection')}>
        <DateSection
          date={date}
          time={time}
          isSpread={isSpread}
          spreadStart={spreadStart}
          spreadEnd={spreadEnd}
          amountValue={amountValue}
          currency={currency}
          onOpenDatePicker={() => setDatePickerOpen(true)}
          onOpenSpreadPicker={() => setSpreadPickerOpen(true)}
          onTimeChange={onTimeChange}
          onTimeFocus={onTimeFocus}
          onEnterSpread={() => {
            onEnterSpread();
            setSpreadPickerOpen(true);
          }}
          onExitSpread={onExitSpread}
        />
      </Section>

      <CalendarPickerModal
        visible={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        mode="single"
        value={date}
        onChange={onDateChange}
      />
      <CalendarPickerModal
        visible={spreadPickerOpen}
        onClose={() => setSpreadPickerOpen(false)}
        mode="range"
        rangeValue={{ start: spreadStart || null, end: spreadEnd || null }}
        onRangeChange={onSpreadRangeChange}
      />
    </>
  );
}
