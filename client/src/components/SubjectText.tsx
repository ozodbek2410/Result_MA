import MathText from './MathText';
import ChemistryText from './ChemistryText';
import BiologyText from './BiologyText';
import PhysicsText from './PhysicsText';
import LiteratureText from './LiteratureText';

interface SubjectTextProps {
  text: string;
  subject?: string;
  className?: string;
}

/**
 * SubjectText - Универсальный компонент для отображения текста с формулами
 * Автоматически выбирает правильный рендерер в зависимости от предмета
 */
export default function SubjectText({ text, subject = 'math', className = '' }: SubjectTextProps) {
  const s = (subject || '').toLowerCase().trim();

  if (s === 'chemistry' || s === 'kimyo' || s.includes('kimyo')) {
    return <ChemistryText text={text} className={className} />;
  }

  if (s === 'biology' || s === 'biologiya' || s.includes('biolog')) {
    return <BiologyText text={text} className={className} />;
  }

  if (s === 'physics' || s === 'fizika' || s.includes('fizik')) {
    return <PhysicsText text={text} className={className} />;
  }

  if (s === 'literature' || s === 'adabiyot' || s.includes('adabiyot') || s.includes('ona tili')) {
    return <LiteratureText text={text} className={className} />;
  }

  return <MathText text={text} className={className} />;
}
