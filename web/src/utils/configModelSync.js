// Monaco YAML models survive navigation in Frigate 0.13.2. Track the last
// version synchronized from disk, separately from edits still in the model.
const synchronizedContents = new WeakMap();

export function setSyncedConfigContents(model, source) {
  if (model) synchronizedContents.set(model, source);
}

export function syncConfigModel(model, source) {
  if (!model) return false;
  if (!synchronizedContents.has(model)) {
    synchronizedContents.set(model, model.getValue());
  }
  const baseline = synchronizedContents.get(model);
  // A user-edited YAML document must never be silently replaced.
  if (model.getValue() !== baseline || baseline === source) return false;
  model.setValue(source);
  synchronizedContents.set(model, source);
  return true;
}
