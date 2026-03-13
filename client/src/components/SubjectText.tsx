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
 * Route text to the correct subject-specific renderer.
 * Case-insensitive matching with CRM name support.
 */
export default function SubjectText({ text, subject = 'math', className = '' }: SubjectTextProps) {
  const s = subject.toLowerCase();

  if (s === 'chemistry' || s === 'kimyo' || s.includes('kimyo')) {
    return <ChemistryText text={text} className={className} />;
  }

  if (s === 'physics' || s === 'fizika' || s.includes('fizika')) {
    return <PhysicsText text={text} className={className} />;
  }

  if (s === 'biology' || s === 'biologiya' || s.includes('biologiya') || s.includes('biolog')) {
    return <BiologyText text={text} className={className} />;
  }

  if (s === 'literature' || s === 'adabiyot' || s.includes('adabiyot') ||
      s === 'ona tili' || s.includes('ona tili') || s.includes('onatili')) {
    return <LiteratureText text={text} className={className} />;
  }

  // Default: MathText (matematika, tarix, ingliz tili, va boshqalar)
  return <MathText text={text} className={className} />;
}
