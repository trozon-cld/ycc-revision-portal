export type CategoryChoice = { id: string; name: string; group: string };

// Options grouped by category group; expects categories sorted by group, then name.
export function CategoryOptions({ categories }: { categories: CategoryChoice[] }) {
  const groups: { name: string; categories: CategoryChoice[] }[] = [];
  for (const category of categories) {
    const last = groups.at(-1);
    if (last && last.name === category.group) last.categories.push(category);
    else groups.push({ name: category.group, categories: [category] });
  }
  return (
    <>
      {groups.map((group) => (
        <optgroup key={group.name} label={group.name}>
          {group.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
