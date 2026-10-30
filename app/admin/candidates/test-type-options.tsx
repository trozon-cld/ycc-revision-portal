export type TestTypeChoice = { id: string; name: string; testArea: string };

// Options grouped by test area; expects test types sorted by test area, then name.
export function TestTypeOptions({ testTypes }: { testTypes: TestTypeChoice[] }) {
  const testAreas: { name: string; testTypes: TestTypeChoice[] }[] = [];
  for (const testType of testTypes) {
    const last = testAreas.at(-1);
    if (last && last.name === testType.testArea) last.testTypes.push(testType);
    else testAreas.push({ name: testType.testArea, testTypes: [testType] });
  }
  return (
    <>
      {testAreas.map((testArea) => (
        <optgroup key={testArea.name} label={testArea.name}>
          {testArea.testTypes.map((testType) => (
            <option key={testType.id} value={testType.id}>
              {testType.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
