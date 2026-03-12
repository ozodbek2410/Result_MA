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
  if (subject === 'chemistry' || subject === 'kimyo') {
    return <ChemistryText text={text} className={className} />;
  }
  
  if (subject === 'biology' || subject === 'biologiya') {
    return <BiologyText text={text} className={className} />;
  }
  
  if (subject === 'physics' || subject === 'fizika') {
    return <PhysicsText text={text} className={className} />;
  }
  
  if (subject === 'literature' || subject === 'adabiyot' || subject === 'ona tili') {
    return <LiteratureText text={text} className={className} />;
  }
  
  // По умолчанию используем MathText (для математики)
  return <MathText text={text} className={className} />;
}
