import { useState, useCallback } from 'react';
import { TestType } from '@/types/test.types';

/**
 * Hook for managing test type state (regular vs block)
 * 
 * @param initialType - Initial test type (default: 'regular')
 * @returns Test type state and helpers
 * 
 * @example
 * ```tsx
 * const { testType, setTestType, isRegular, isBlock, toggle } = useTestType();
 * 
 * return (
 *   <div>
 *     <button onClick={() => setTestType('regular')}>Regular</button>
 *     <button onClick={() => setTestType('block')}>Block</button>
 *     {isRegular && <RegularTestForm />}
 *     {isBlock && <BlockTestForm />}
 *   </div>
 * );
 * ```
 */
export function useTestType(initialType: TestType = 'regular') {
  const [testType, setTestType] = useState<TestType>(initialType);

  // Computed values
  const isRegular = testType === 'regular';
  const isBlock = testType === 'block';

  // Toggle between types
  const toggle = useCallback(() => {
    setTestType((prev) => (prev === 'regular' ? 'block' : 'regular'));
  }, []);

  // Set to regular
  const setRegular = useCallback(() => {
    setTestType('regular');
  }, []);

  // Set to block
  const setBlock = useCallback(() => {
    setTestType('block');
  }, []);

  return {
    testType,
    setTestType,
    isRegular,
    isBlock,
    toggle,
    setRegular,
    setBlock,
  };
}
