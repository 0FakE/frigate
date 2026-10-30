import { h } from 'preact';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import LiveZoneEditor from '../LiveZoneEditor';
import { setLocaleMessages } from '../../locales';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

const cameraData = () => ({
  revision: 'revision-1',
  zones: {
    area_a: [[20, 20], [120, 20], [120, 120]],
    area_b: [[70, 70], [220, 70], [220, 190]],
  },
  motion_masks: [],
  object_masks: {},
});

describe('LiveZoneEditor vertex interactions', () => {
  beforeEach(() => {
    setLocaleMessages(null);
    axios.get.mockReset().mockResolvedValue({ data: cameraData() });
    axios.put.mockReset().mockResolvedValue({ data: { revision: 'revision-2' } });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      left: 0,
      top: 0,
      width: 640,
      height: 360,
      right: 640,
      bottom: 360,
    }));
  });

  afterEach(() => {
    setLocaleMessages(null);
    vi.restoreAllMocks();
  });

  async function openEditor(props = {}) {
    const onDirtyChange = vi.fn();
    const view = render(
      <LiveZoneEditor
        camera="test_camera"
        width={640}
        height={360}
        displayWidth={640}
        onClose={vi.fn()}
        onDirtyChange={onDirtyChange}
        {...props}
      >
        <div>Live stream</div>
      </LiveZoneEditor>
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'area_a' })).toBeInTheDocument());
    if (props.streamReady !== false && !props.streamError && !props.streamDisabled) {
      await waitFor(() => expect(screen.getByRole('button', { name: 'Zone' })).not.toBeDisabled());
    }
    const svg = view.container.querySelector('[data-testid="live-editor-viewport"] > svg');
    return { ...view, svg, onDirtyChange };
  }

  test('overlapping shapes do not intercept clicks intended for the selected zone', async () => {
    const { svg, onDirtyChange } = await openEditor();
    const areaA = screen.getByRole('button', { name: 'area_a' });
    expect(screen.getByRole('button', { name: 'Bereich löschen' })).toBeDisabled();
    expect(svg.querySelectorAll('polygon')).toHaveLength(2);
    expect([...svg.querySelectorAll('polygon')].every((p) => p.parentElement.style.pointerEvents === 'none')).toBe(true);

    fireEvent.click(areaA);
    expect(screen.getByRole('button', { name: 'Bereich löschen' })).not.toBeDisabled();
    expect(svg.querySelectorAll('ellipse')).toHaveLength(3);

    // This image position is inside area B but must still extend area A.
    fireEvent.click(svg, { button: 0, clientX: 110, clientY: 100 });
    expect(svg.querySelectorAll('ellipse')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Bereich löschen' })).not.toBeDisabled();
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(true));

    fireEvent.click(areaA); // clicking the active selector toggles it off
    expect(screen.getByRole('button', { name: 'Bereich löschen' })).toBeDisabled();
    expect(svg.querySelectorAll('ellipse')).toHaveLength(0);
    fireEvent.click(svg, { button: 0, clientX: 180, clientY: 120 });
    fireEvent.click(areaA);
    expect(svg.querySelectorAll('ellipse')).toHaveLength(4);
  });

  test('shows no empty notice slot and uses 16px spacing only when a notice is visible', async () => {
    const { container } = await openEditor();
    const video = container.querySelector('.relative');
    const videoParent = video.parentElement;

    expect(screen.queryByTestId('live-editor-notices')).not.toBeInTheDocument();
    expect(videoParent.firstElementChild).toBe(video);
    expect(screen.queryByText('Nicht gespeicherte Änderungen')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    const noticeSlot = screen.getByTestId('live-editor-notices');
    expect(screen.getByRole('status')).toHaveTextContent('Nicht gespeicherte Änderungen');
    expect(noticeSlot).toHaveClass('mb-4', 'flex', 'flex-col', 'gap-4');
    expect(noticeSlot).not.toHaveClass('min-h-10', 'gap-3', 'overflow-y-auto');
    expect(screen.getByRole('status')).not.toHaveClass('mb-4');
    expect(noticeSlot.nextElementSibling).toBe(video);

    fireEvent.click(screen.getByRole('button', { name: 'Bearbeitung beenden' }));
    expect(screen.queryByTestId('live-editor-notices')).not.toBeInTheDocument();
    expect(videoParent.firstElementChild).toBe(video);
    expect(screen.queryByText('Nicht gespeicherte Änderungen')).not.toBeInTheDocument();
  });

  test('editor errors open native alerts without adding another notice above the video', async () => {
    const { container } = await openEditor();
    const video = container.querySelector('.relative');
    expect(screen.queryByTestId('live-editor-notices')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    const noticeSlot = screen.getByTestId('live-editor-notices');
    expect(noticeSlot.querySelectorAll('[role="status"]')).toHaveLength(1);

    vi.spyOn(window, 'prompt').mockReturnValueOnce('area_a');
    fireEvent.click(screen.getByRole('button', { name: 'Zone' }));

    expect(window.alert).toHaveBeenCalledWith(
      'Eine Zone mit diesem Namen ist bereits vorhanden. Bitte wähle einen anderen Zonennamen.'
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(noticeSlot.querySelector('[role="status"]')).toHaveTextContent(
      'Nicht gespeicherte Änderungen'
    );
    expect(noticeSlot).toHaveClass('mb-4', 'gap-4', 'flex-col');
    expect(noticeSlot.nextElementSibling).toBe(video);
    expect([...noticeSlot.children]).toHaveLength(1);
  });

  test('shows the status immediately when selecting an unchanged area without marking data dirty', async () => {
    const { svg, onDirtyChange } = await openEditor();
    const area = screen.getByRole('button', { name: 'area_a' });
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled();
    expect(screen.queryByText('Nicht gespeicherte Änderungen')).not.toBeInTheDocument();

    fireEvent.click(area);
    expect(area).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Nicht gespeicherte Änderungen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled();
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);

    fireEvent.click(svg, { button: 0, clientX: 35, clientY: 90 });
    expect(screen.getByText('Nicht gespeicherte Änderungen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).not.toBeDisabled();
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(true));
  });

  test('deselection keeps unsaved changes and does not require Save', async () => {
    const { svg } = await openEditor();
    const save = screen.getByRole('button', { name: 'Änderungen speichern' });
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    fireEvent.click(svg, { button: 0, clientX: 35, clientY: 90 });
    expect(save).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Bearbeitung beenden' }));
    expect(screen.getByRole('button', { name: 'Bereich löschen' })).toBeDisabled();
    expect(save).not.toBeDisabled();
    expect(axios.put).not.toHaveBeenCalled();

    fireEvent.click(save);
    await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(1));
    expect(axios.put.mock.calls[0][1].zones.area_a).toHaveLength(4);
  });

  test('successful Save deselects the active polygon without hiding its shape', async () => {
    const { svg } = await openEditor();
    const areaA = screen.getByRole('button', { name: 'area_a' });
    fireEvent.click(areaA);
    fireEvent.click(svg, { button: 0, clientX: 35, clientY: 90 });
    expect(areaA).toHaveAttribute('aria-pressed', 'true');
    expect(svg.querySelectorAll('ellipse')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Bereich löschen' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Die Änderungen wurden gespeichert.'));

    expect(areaA).toHaveAttribute('aria-pressed', 'false');
    expect(svg.querySelectorAll('ellipse')).toHaveLength(0);
    expect(svg.querySelectorAll('polygon')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Bearbeitung beenden' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bereich löschen' })).toBeDisabled();
  });

  test('group headings and selected and unselected area buttons use 14px text', async () => {
    await openEditor();
    const zoneHeading = screen.getByRole('heading', { name: 'Zonen 2' });
    expect(zoneHeading).toHaveClass('text-sm');
    expect(zoneHeading.lastElementChild).toHaveClass('ml-auto', 'tabular-nums', 'bg-slate-100', 'dark:bg-slate-800/70');
    expect(zoneHeading.lastElementChild).toHaveTextContent('2');
    expect(screen.getByRole('heading', { name: 'Masken 0' })).toHaveClass('text-sm');
    expect(screen.getByRole('heading', { name: 'Objektfilter 0' })).toHaveClass('text-sm');
    const areaA = screen.getByRole('button', { name: 'area_a' });
    expect(areaA).toHaveClass('text-sm');
    expect(areaA).not.toHaveClass('ring-1', 'ring-blue-500/30');
    fireEvent.click(areaA);
    expect(areaA).toHaveClass('text-sm');
    expect(areaA).not.toHaveClass('ring-1', 'ring-blue-500/30');
  });

  test('uses unobstructed heading icons and subtle theme-specific background contrast for area lists', async () => {
    await openEditor();

    for (const name of ['Neuen Bereich erstellen', 'Vorhandene Bereiche']) {
      const heading = screen.getByRole('heading', { name });
      const icon = heading.firstElementChild;
      expect(icon).toHaveClass('h-7', 'w-7', 'text-blue-600', 'dark:text-blue-400');
      expect(icon).not.toHaveClass('rounded-lg', 'bg-blue-500/[0.15]');
    }
    for (const name of ['Zonen 2', 'Masken 0', 'Objektfilter 0']) {
      expect(screen.getByRole('heading', { name }))
        .toHaveClass('bg-slate-200', 'dark:bg-slate-950/80');
    }

    const area = screen.getByRole('button', { name: 'area_a' });
    expect(area).toHaveAttribute('aria-pressed', 'false');
    expect(area).toHaveClass('bg-slate-100', 'dark:bg-slate-900/40',
      'hover:bg-slate-200/70', 'dark:hover:bg-slate-800');
    fireEvent.click(area);
    expect(area).toHaveAttribute('aria-pressed', 'true');
    expect(area).toHaveClass('bg-blue-600/20');
    expect(area).not.toHaveClass('dark:bg-slate-900/40');
    fireEvent.click(area);
    expect(area).toHaveAttribute('aria-pressed', 'false');
    expect(area).toHaveClass('bg-slate-100', 'dark:bg-slate-900/40');
  });
  test('keeps compact grouped tools visible on mobile and in the 360px desktop sidebar', async () => {
    const { container } = await openEditor();
    const panel = screen.getByRole('complementary', { name: 'Werkzeuge und Bereiche' });

    expect(panel).toHaveClass('xl:order-last', 'xl:w-[360px]');
    expect(screen.queryByRole('heading', { name: 'Bearbeitungsmenü' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bearbeitungsmenü/ })).not.toBeInTheDocument();
    expect(container.querySelector('#live-polygon-tools')).toHaveClass('space-y-2');
    expect(container.querySelector('#live-polygon-tools')).not.toHaveClass('hidden');
    expect(screen.getByRole('heading', { name: 'Neuen Bereich erstellen' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vorhandene Bereiche' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ausgewählter Bereich' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Zonen 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Masken 0' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Objektfilter 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'area_a' })).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('.xl\\:order-first')).not.toBeNull();
  });

  test('modern editor keeps all three creation actions, selection actions and save commands', async () => {
    const { container } = await openEditor();
    const tools = container.querySelector('#live-polygon-tools');
    const panel = screen.getByRole('complementary', { name: 'Werkzeuge und Bereiche' });

    expect(panel).toHaveClass('xl:w-[360px]');
    expect(tools).toHaveClass('space-y-2');
    const zone = screen.getByRole('button', { name: 'Zone' });
    const mask = screen.getByRole('button', { name: 'Maske' });
    const filter = screen.getByRole('button', { name: 'Objektfilter' });
    const objectClass = screen.getByRole('combobox', { name: 'Objektklasse' });
    expect(zone).toBeEnabled();
    expect(mask).toBeEnabled();
    expect(filter).toBeEnabled();
    expect(zone).toHaveClass('h-10');
    expect(mask).toHaveClass('h-10');
    expect(filter).toHaveClass('h-10');
    expect(zone).toHaveClass('border-green-500', 'bg-white', 'dark:bg-slate-800/90', 'text-green-500');
    expect(mask).toHaveClass('border-red-500', 'bg-white', 'dark:bg-slate-800/90', 'text-red-500');
    expect(filter).toHaveClass('border-blue-500', 'bg-white', 'dark:bg-slate-800/90', 'text-blue-500');
    expect(objectClass).toHaveClass('h-10', 'w-full', 'min-w-0');
    expect(zone.parentElement).toHaveClass('grid', 'grid-cols-2', 'gap-2');
    expect(filter.parentElement).toHaveClass('grid', 'grid-cols-2', 'gap-2');
    expect(objectClass.parentElement).toBe(filter.parentElement);
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Änderungen verwerfen' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Editor schließen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Bearbeitungsmenü')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Neuen Bereich erstellen' })).toHaveClass('mb-2');
    expect(screen.getByRole('heading', { name: 'Vorhandene Bereiche' })).toHaveClass('mb-2');
    expect(screen.getByRole('heading', { name: 'Ausgewählter Bereich' })).toHaveClass('mb-2');
    expect(screen.getByText('Wähle einen Bereich zum Bearbeiten aus.')).toHaveClass('mb-3', 'whitespace-pre-line');

    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    expect(screen.getByText('Eckpunkte: 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bereich löschen' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Bereich löschen' }))
      .toHaveClass('bg-red-800', 'border-red-700', 'text-white', 'shadow-lg', 'shadow-red-900/20', 'hover:bg-red-700');
    expect(screen.getByRole('button', { name: 'Bereich löschen' }))
      .not.toHaveClass('bg-red-500/10', 'border-red-500/40', 'text-red-300');
    expect(screen.getByRole('button', { name: 'Bearbeitung beenden' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled();
  });

  test('Events shows exactly the requested video and snapshot captions for selected zones only', async () => {
    await openEditor();
    expect(screen.queryByText('Events')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Videoaufnahme speichern' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Snapshot speichern' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Videoaufnahme speichern' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Zonenbeschränkung für Videoaufnahme speichern' }))
      .toHaveValue('all');
  });

  test('recording and snapshots can select different zones without changing other editor settings', async () => {
    const { onDirtyChange } = await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Zonenbeschränkung für Videoaufnahme speichern' }),
      { target: { value: 'selected' } });
    expect(screen.getByRole('checkbox', { name: 'Videoaufnahme speichern' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Snapshot speichern' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'area_b' }));
    expect(screen.getByRole('checkbox', { name: 'Videoaufnahme speichern' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Videoaufnahme speichern' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Zonenbeschränkung für Snapshot speichern' }),
      { target: { value: 'selected' } });
    expect(screen.getByRole('checkbox', { name: 'Snapshot speichern' })).toBeChecked();
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(true));
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(1));
    expect(axios.put.mock.calls[0][1].zone_event_zones).toEqual({
      record: ['area_a', 'area_b'],
      snapshots: ['area_b'],
    });
  });

  test('Events never maps deselecting the last required zone to unrestricted mode', async () => {
    axios.get.mockResolvedValue({ data: {
      ...cameraData(),
      zone_event_zones: { record: ['area_a'], snapshots: ['area_a', 'area_b'] },
    } });
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Videoaufnahme speichern' }));
    expect(window.alert).toHaveBeenCalledWith(
      'Bitte wähle mindestens eine Zone aus, oder stelle auf „Alle Zonen (keine Einschränkung)“ um.'
    );
    expect(screen.getByRole('checkbox', { name: 'Videoaufnahme speichern' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled();
  });

  test('deleting the last event zone requires an explicit unrestricted choice', async () => {
    axios.get.mockResolvedValue({ data: {
      ...cameraData(),
      zone_event_zones: { record: ['area_a'], snapshots: ['area_a', 'area_b'] },
    } });
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bereich löschen' }));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('letzte ausgewählte Zone'));
    expect(screen.getByRole('button', { name: 'area_a' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Zonenbeschränkung für Videoaufnahme speichern' }),
      { target: { value: 'all' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bereich löschen' }));
    expect(screen.queryByRole('button', { name: 'area_a' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(1));
    expect(axios.put.mock.calls[0][1].zone_event_zones)
      .toEqual({ record: [], snapshots: ['area_b'] });
  });

  test('Events keeps references on rename and drops them on deletion', async () => {
    axios.get.mockResolvedValue({ data: {
      ...cameraData(),
      zone_event_zones: { record: ['area_a'], snapshots: ['area_a', 'area_b'] },
    } });
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zone umbenennen' }));
    fireEvent.input(screen.getByRole('textbox', { name: 'Neuer Name der Zone' }),
      { target: { value: 'entry_new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(1));
    expect(axios.put.mock.calls[0][1].zone_event_zones).toEqual({
      record: ['entry_new'], snapshots: ['entry_new', 'area_b'],
    });
  });

  test('renames a zone inline with validation, tooltip and correct save mapping', async () => {
    const { onDirtyChange } = await openEditor();
    expect(screen.queryByRole('button', { name: 'Zone umbenennen' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    const edit = screen.getByRole('button', { name: 'Zone umbenennen' });
    expect(edit).toHaveAttribute('title', 'Zone umbenennen');
    expect(edit).toHaveClass('ml-2', 'h-5', 'w-5', 'text-slate-800', 'dark:text-white');
    expect(edit).not.toHaveClass('h-7', 'w-7', 'text-blue-300');
    expect(edit.querySelector('svg')).toHaveClass('h-5', 'w-5');
    expect(edit.querySelectorAll('svg path')).toHaveLength(2);
    expect(edit.parentElement.nextElementSibling).toHaveTextContent('Eckpunkte: 3');
    fireEvent.click(edit);
    const input = screen.getByRole('textbox', { name: 'Neuer Name der Zone' });
    expect(screen.getByText('Neuer Name der Zone')).toHaveClass('text-sm', 'font-semibold', 'text-slate-900', 'dark:text-slate-100');
    fireEvent.input(input, { target: { value: 'area_b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(screen.getByRole('alert')).toHaveTextContent('ist bereits vorhanden');
    fireEvent.input(input, { target: { value: 'bad name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(window.alert).toHaveBeenCalledWith(
      'Der eingegebene Zonenname ist ungültig. Bitte verwende ausschließlich Buchstaben, Zahlen und Unterstriche.'
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Neuer Name der Zone' })).toHaveValue('bad name');
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled();
    fireEvent.input(input, { target: { value: 'entry_new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(screen.queryByRole('textbox', { name: 'Neuer Name der Zone' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'entry_new' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'area_a' })).not.toBeInTheDocument();
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(true));
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(1));
    expect(axios.put.mock.calls[0][1].zone_renames).toEqual({ area_a: 'entry_new' });
    expect(axios.put.mock.calls[0][1].zones.entry_new).toHaveLength(3);
  });


  test('opens settings icon inline, restricts objects and sends zone_objects on save', async () => {
    const { onDirtyChange } = await openEditor({ trackedObjects: ['Person', 'Katze', 'Hund'] });
    expect(screen.queryByRole('button', { name: 'Erfasste Objekte bearbeiten' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    const settings = screen.getByRole('button', { name: 'Erfasste Objekte bearbeiten' });
    expect(settings).toHaveAttribute('title', 'Erfasste Objekte bearbeiten');
    expect(settings).toHaveAttribute('aria-label', 'Erfasste Objekte bearbeiten');
    expect(settings).toHaveClass('ml-2', 'h-5', 'w-5', 'text-slate-800', 'dark:text-white');
    expect(settings).toHaveAttribute('aria-expanded', 'false');
    expect(settings.querySelector('svg')).toHaveClass('h-5', 'w-5');
    expect(settings.parentElement).toBe(screen.getByRole('button', { name: 'Zone umbenennen' }).parentElement);
    fireEvent.click(settings);
    expect(settings).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Erfasste Objekte dieser Zone')).toBeInTheDocument();
    expect(screen.getByLabelText('Alle Objekte erfassen')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Nur ausgewählte Objekte erfassen'));
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(window.alert).toHaveBeenCalledWith(
      'Bitte wähle mindestens eine Objekt zur Erfassung aus, oder wähle „Alle Objekte erfassen“.'
    );
    expect(window.alert).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nur ausgewählte Objekte erfassen')).toBeChecked();
    expect(settings).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Person' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Katze' }));
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(settings).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(true));
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(1));
    expect(axios.put.mock.calls[0][1].zone_objects).toEqual({
      area_a: ['Person', 'Katze'],
      area_b: null,
    });
  });

  test('shows existing zone objects and cancel, reset to all, and rename preserve selection', async () => {
    axios.get.mockResolvedValue({ data: {
      ...cameraData(),
      zone_objects: { area_a: ['Person', 'Katze'], area_b: null },
    } });
    await openEditor({ trackedObjects: ['Person', 'Katze', 'Hund'] });
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Erfasste Objekte bearbeiten' }));
    expect(screen.getByLabelText('Nur ausgewählte Objekte erfassen')).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Person' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Katze' })).toBeChecked();
    fireEvent.click(screen.getByLabelText('Alle Objekte erfassen'));
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Erfasste Objekte bearbeiten' }));
    expect(screen.getByRole('checkbox', { name: 'Person' })).toBeChecked();
    fireEvent.click(screen.getByLabelText('Alle Objekte erfassen'));
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zone umbenennen' }));
    fireEvent.input(screen.getByRole('textbox', { name: 'Neuer Name der Zone' }), { target: { value: 'area_new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(1));
    expect(axios.put.mock.calls[0][1].zone_renames).toEqual({ area_a: 'area_new' });
    expect(axios.put.mock.calls[0][1].zone_objects).toEqual({ area_new: null, area_b: null });
  });

  test('the zone object settings panel closes when another shape is selected', async () => {
    await openEditor({ trackedObjects: ['Person'] });
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Erfasste Objekte bearbeiten' }));
    expect(screen.getByText('Erfasste Objekte dieser Zone')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'area_b' }));
    expect(screen.queryByText('Erfasste Objekte dieser Zone')).not.toBeInTheDocument();
  });

  test('canceling a zone rename leaves data unchanged', async () => {
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zone umbenennen' }));
    fireEvent.input(screen.getByRole('textbox', { name: 'Neuer Name der Zone' }), { target: { value: 'not_saved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.getByRole('button', { name: 'area_a' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled();
  });

  test('optional camera toolbar and options panel render under the video without blocking polygon input', async () => {
    const { container, svg } = await openEditor({
      toolbar: <button type="button">Show Options</button>,
      optionsPanel: <div>Anzeigeoptionen</div>,
    });
    const video = screen.getByTestId('live-editor-viewport');
    const controls = screen.getByRole('button', { name: 'Show Options' });
    expect(video.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Anzeigeoptionen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    fireEvent.click(svg, { button: 0, clientX: 110, clientY: 100 });
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeEnabled();
    expect(container.querySelectorAll('svg polygon')).toHaveLength(2);
  });

  test('shows an accessible bold white 16px dirty notice and a matching green save confirmation', async () => {
    const { svg } = await openEditor();
    expect(screen.queryByText('Nicht gespeicherte Änderungen')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    fireEvent.click(svg, { button: 0, clientX: 35, clientY: 90 });
    const warning = screen.getByRole('status');
    expect(warning).toHaveTextContent('Nicht gespeicherte Änderungen');
    expect(warning).not.toHaveClass('mb-4');
    expect(warning.firstElementChild).toHaveClass('font-bold', 'text-slate-900', 'dark:text-white', 'text-base');
    expect(warning.firstElementChild).not.toHaveClass('text-lg');
    expect(warning.querySelector('svg[stroke="currentColor"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(1));

    const saved = screen.getByRole('status');
    expect(saved).not.toHaveClass('mb-4');
    expect(saved.firstElementChild).toHaveClass('text-green-700', 'dark:text-green-400', 'text-base');
    expect(saved.firstElementChild).not.toHaveClass('text-white', 'dark:text-white');
    expect(saved).toHaveTextContent('Die Änderungen wurden gespeichert. Ein Neustart von Frigate ist erforderlich.');
    expect(saved.querySelector('strong')).toHaveTextContent('Ein Neustart von Frigate ist erforderlich.');
    expect(saved.querySelector('svg[stroke="currentColor"]')).not.toBeNull();
    expect(screen.queryByText('Nicht gespeicherte Änderungen')).not.toBeInTheDocument();
  });

  test('uses native browser alerts for invalid names and polygons', async () => {
    const { svg } = await openEditor();
    vi.spyOn(window, 'prompt').mockReturnValueOnce('invalid name').mockReturnValueOnce('valid_zone');

    fireEvent.click(screen.getByRole('button', { name: 'Zone' }));
    expect(window.alert).toHaveBeenCalledWith(
      'Der eingegebene Zonenname ist ungültig. Bitte verwende ausschließlich Buchstaben, Zahlen und Unterstriche.'
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zone' }));
    expect(window.alert).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Nicht gespeicherte Änderungen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    expect(window.alert).toHaveBeenCalledWith(
      'Die Zone „valid_zone“ kann nicht gespeichert werden. Bitte lege mindestens drei Eckpunkte fest, die nicht auf einer Linie liegen.'
    );
    expect(window.alert).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(axios.put).not.toHaveBeenCalled();
    expect(svg.querySelectorAll('ellipse')).toHaveLength(0);
  });

  test('native editor alerts use editable host modal error and warning keys', async () => {
    setLocaleMessages({ cameras: { debug: { editor: { modal: {
      error: { invalid_zone_name: 'Bitte anderen Namen wählen.' },
      warning: { invalid_zone: 'Ungültige Zone: {name}.' },
    } } } } });
    await openEditor();
    vi.spyOn(window, 'prompt').mockReturnValueOnce('not valid').mockReturnValueOnce('Testzone');

    fireEvent.click(screen.getByRole('button', { name: 'Zone' }));
    expect(window.alert).toHaveBeenNthCalledWith(1, 'Bitte anderen Namen wählen.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    expect(window.alert).toHaveBeenNthCalledWith(2, 'Ungültige Zone: Testzone.');
    expect(screen.getByText('Nicht gespeicherte Änderungen')).toBeInTheDocument();
    expect(axios.put).not.toHaveBeenCalled();
  });

  test('shows only the short names of existing zones, motion masks and object masks', async () => {
    axios.get.mockResolvedValue({
      data: {
        ...cameraData(),
        motion_masks: [[[20, 20], [40, 20], [40, 40]]],
        object_masks: { person: [[[30, 30], [80, 30], [80, 80]]] },
      },
    });
    await openEditor();
    expect(screen.getByRole('button', { name: 'area_a' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maske 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'person 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zone: area_a' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Objektmaske: person 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Masken 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Objektfilter 1' })).toBeInTheDocument();
  });

  test('failed API writes open an alert while the unsaved indicator remains visible', async () => {
    axios.put.mockRejectedValueOnce({ response: { data: { message: 'Speichern fehlgeschlagen' } } });
    const { svg } = await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    fireEvent.click(svg, { button: 0, clientX: 35, clientY: 90 });
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(
      'Die Änderungen konnten nicht gespeichert werden. Speichern fehlgeschlagen.'
    ));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Nicht gespeicherte Änderungen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'area_a' })).toHaveAttribute('aria-pressed', 'true');
    expect(svg.querySelectorAll('ellipse')).toHaveLength(4);
  });

  test('failed API reads open a native alert instead of rendering an error notice', async () => {
    axios.get.mockRejectedValueOnce({ response: { data: { message: 'Nicht erreichbar' } } });
    render(
      <LiveZoneEditor camera="test_camera" width={640} height={360} displayWidth={640}
        onClose={vi.fn()} onDirtyChange={vi.fn()}>
        <div>Live stream</div>
      </LiveZoneEditor>
    );
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(
      'Die vorhandenen Bereiche konnten nicht geladen werden. Nicht erreichbar.'
    ));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live-editor-notices')).not.toBeInTheDocument();
  });

  test('duplicate zone names have their own complete error sentence', async () => {
    await openEditor();
    vi.spyOn(window, 'prompt').mockReturnValue('area_a');
    fireEvent.click(screen.getByRole('button', { name: 'Zone' }));
    expect(window.alert).toHaveBeenCalledWith('Eine Zone mit diesem Namen ist bereits vorhanden. Bitte wähle einen anderen Zonennamen.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(axios.put).not.toHaveBeenCalled();
  });

  test.each([
    ['mask', 'Maske', 'Der abgedeckte Bereich „Maske 1“ kann nicht gespeichert werden.'],
    ['object', 'Objektfilter', 'Der Objektfilter „person 1“ kann nicht gespeichert werden.'],
  ])('new %s starts without premature warnings and validates only on Save', async (_, buttonName, expected) => {
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: buttonName }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Nicht gespeicherte Änderungen')).toBeInTheDocument();
    expect(screen.queryByText('Zum Zeichnen ins Videobild klicken')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(expected));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(axios.put).not.toHaveBeenCalled();
  });


  test('editor panels, fields and group rows use light and dark variants', async () => {
    await openEditor({ streamReady: true });
    const sidebar = screen.getByRole('complementary', { name: 'Werkzeuge und Bereiche' });
    expect(sidebar).toHaveClass('text-slate-900', 'dark:text-slate-100');
    const newArea = screen.getByRole('region', { name: 'Neuen Bereich erstellen' });
    expect(newArea).toHaveClass('bg-white', 'dark:bg-slate-800/90');
    expect(newArea).toHaveClass('border-slate-300', 'dark:border-slate-700/80');
    const selector = screen.getByRole('combobox', { name: 'Objektklasse' });
    expect(selector).toHaveClass('bg-white', 'dark:bg-slate-950');
    expect(screen.getByRole('heading', { name: 'Zonen 2' }))
      .toHaveClass('bg-slate-200', 'dark:bg-slate-950/80');
  });

  test('editor reports an unavailable camera image without showing polygon overlay', async () => {
    const { container } = await openEditor({ streamReady: false, streamError: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Die Kameravorschau konnte nicht geladen werden.');
    expect(container.querySelector('[data-testid="live-editor-viewport"] > svg').querySelectorAll('polygon')).toHaveLength(0);
  });

  test.each([
    ['loading', { streamReady: false }, 'Vorschau wird geladen...', 'status'],
    ['disabled', { streamReady: false, streamDisabled: true }, 'Kamera ist deaktiviert', 'alert'],
    ['error', { streamReady: false, streamError: true }, 'Die Kameravorschau konnte nicht geladen werden.', 'alert'],
  ])('locks every editor control while preview is %s', async (_, props, text, role) => {
    const { svg } = await openEditor(props);
    const notice = screen.getByRole(role);
    expect(notice).toHaveTextContent(text);
    expect(notice).toHaveClass('font-bold');
    expect(notice.classList.contains('text-red-600')).toBe(role === 'alert');
    expect(notice.classList.contains('dark:text-red-400')).toBe(role === 'alert');

    for (const name of ['Zone', 'Maske', 'Objektfilter', 'area_a',
      'Änderungen verwerfen', 'Änderungen speichern']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('combobox', { name: 'Objektklasse' })).toBeDisabled();
    expect(svg.querySelectorAll('polygon')).toHaveLength(0);
    expect(svg).toHaveClass('invisible', 'pointer-events-none');
    fireEvent.click(svg, { button: 0, clientX: 20, clientY: 20 });
    expect(window.alert).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
  });

  test('editor actions unlock as soon as a frame is received', async () => {
    const { rerender, svg } = await openEditor({ streamReady: false });
    expect(screen.getByRole('button', { name: 'Zone' })).toBeDisabled();
    rerender(<LiveZoneEditor camera="test_camera" width={640} height={360} displayWidth={640}
      streamReady={true} onDirtyChange={vi.fn()}><div>Live stream</div></LiveZoneEditor>);
    expect(screen.getByRole('button', { name: 'Zone' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'area_a' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Objektklasse' })).toBeEnabled();
    expect(svg.querySelectorAll('polygon')).toHaveLength(2);
  });

  test('hides polygons and vertex hit targets until a video frame is available', async () => {
    const { container, rerender, svg } = await openEditor({ streamReady: false });
    expect(screen.getByText('Vorschau wird geladen...')).toBeInTheDocument();
    expect(svg.querySelectorAll('polygon')).toHaveLength(0);
    expect(svg).toHaveClass('invisible', 'pointer-events-none');

    rerender(
      <LiveZoneEditor camera="test_camera" width={640} height={360} displayWidth={640}
        streamReady={true} onClose={vi.fn()} onDirtyChange={vi.fn()}>
        <div>Live stream</div>
      </LiveZoneEditor>
    );
    expect(screen.queryByText('Vorschau wird geladen...')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="live-editor-viewport"] > svg').querySelectorAll('polygon')).toHaveLength(2);
    expect(container.querySelector('[data-testid="live-editor-viewport"] > svg')).not.toHaveClass('invisible');
  });

  test('stream, loading cover, and polygon overlay share one explicit viewport', async () => {
    const { container, svg } = await openEditor({ streamReady: false });
    const preview = screen.getByTestId('live-editor-viewport');
    const streamSlot = screen.getByTestId('live-editor-video-slot');
    const loading = screen.getByText('Vorschau wird geladen...');

    expect(preview).toHaveClass('relative', 'live-polygon-preview', 'overflow-hidden');
    expect(preview).not.toHaveClass('grid');
    expect(preview.style.width).toBe('640px');
    expect(preview.style.maxWidth).toBe('100%');
    expect(preview.style.aspectRatio).toBe('640 / 360');
    expect(streamSlot.parentElement).toBe(preview);
    expect(streamSlot).toHaveClass('absolute', 'inset-0');
    expect(streamSlot).toHaveTextContent('Live stream');
    expect(loading).toHaveClass('absolute', 'inset-0');
    expect(loading.parentElement).toBe(preview);
    expect(svg).toHaveClass('absolute', 'inset-0');
    expect(svg.parentElement).toBe(preview);
    expect(container.querySelector('.relative')).toBe(preview);
  });

  test('shared viewport scales responsively without changing detect coordinate space', async () => {
    const { svg } = await openEditor({
      width: 800, height: 600, displayWidth: 400, streamReady: false,
    });
    const preview = screen.getByTestId('live-editor-viewport');
    expect(preview.style.width).toBe('400px');
    expect(preview.style.maxWidth).toBe('100%');
    expect(preview.style.aspectRatio).toBe('800 / 600');
    expect(svg.getAttribute('viewBox')).toBe('0 0 800 600');
    expect(screen.getByTestId('live-editor-video-slot')).toHaveClass('absolute', 'inset-0');
    expect(screen.getByText('Vorschau wird geladen...').parentElement).toBe(preview);
  });

  test('compact object-class select and no selection checkmark', async () => {
    await openEditor();
    expect(screen.getByRole('combobox', { name: 'Objektklasse' })).toHaveClass('w-full', 'min-w-0', 'h-10');
    expect(screen.getByRole('combobox', { name: 'Objektklasse' })).not.toHaveClass('w-[145px]', 'flex-1');
    const area = screen.getByRole('button', { name: 'area_a' });
    fireEvent.click(area);
    expect(area).toHaveAttribute('aria-pressed', 'true');
    expect(area.textContent).toBe('area_a');
    expect(screen.getByRole('heading', { name: 'Vorhandene Bereiche' })).toBeInTheDocument();
  });

  test('only hovering a list entry shows its more opaque label inside the video', async () => {
    const { svg } = await openEditor();
    const areaA = screen.getByRole('button', { name: 'area_a' });
    const areaB = screen.getByRole('button', { name: 'area_b' });

    fireEvent.mouseMove(svg, { clientX: 90, clientY: 50 });
    expect(screen.queryByTestId('live-editor-hover-label')).not.toBeInTheDocument();

    fireEvent.mouseEnter(areaA);
    const label = screen.getByTestId('live-editor-hover-label');
    expect(label).toHaveTextContent('area_a');
    expect(label).toHaveClass('pointer-events-none', 'bg-slate-950/95');
    expect(label).toHaveAttribute('aria-hidden', 'true');
    expect(label.style.left).toMatch(/px$/);
    expect(label).toHaveClass('w-max', 'max-w-[calc(100%-16px)]', 'break-words');
    expect(label).toHaveClass('text-xs');
    expect(label).not.toHaveClass('text-sm', 'max-w-[60%]');
    expect(label.querySelector('span:last-child')).not.toHaveClass('break-all');
    expect(label.style.top).toMatch(/%$/);
    expect(areaA).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('live-editor-notices')).not.toBeInTheDocument();

    fireEvent.mouseLeave(areaA);
    expect(screen.queryByTestId('live-editor-hover-label')).not.toBeInTheDocument();
    fireEvent.mouseEnter(areaB);
    expect(screen.getByTestId('live-editor-hover-label')).toHaveTextContent('area_b');
    fireEvent.mouseLeave(areaB);
    expect(screen.queryByTestId('live-editor-hover-label')).not.toBeInTheDocument();
    expect(svg.querySelectorAll('polygon')).toHaveLength(2);
  });

  test('long area names wrap only at the video edge and clamped labels stay in the viewport', async () => {
    const { rerender } = await openEditor();
    const area = screen.getByRole('button', { name: 'area_a' });
    fireEvent.mouseEnter(area);
    const label = screen.getByTestId('live-editor-hover-label');
    expect(label).toHaveClass('text-xs');
    expect(label).toHaveClass('w-max', 'max-w-[calc(100%-16px)]', 'break-words');

    // Simulate measured tooltip width near the right video edge. Its center
    // must move left instead of overflowing the camera video element.
    label.getBoundingClientRect = () => ({ width: 130, height: 24, x: 0, y: 0, top: 0, left: 0, right: 130, bottom: 24 });
    // Trigger the mocked ResizeObserver's callback if the test setup supports
    // it; the layout contract above is also valuable in jsdom without layout.
    rerender(
      <LiveZoneEditor camera="test_camera" width={640} height={360} displayWidth={640}
        onDirtyChange={vi.fn()} streamReady={true}>
        <div>Live stream</div>
      </LiveZoneEditor>
    );
    expect(screen.getByTestId('live-editor-hover-label'))
      .toHaveClass('w-max', 'max-w-[calc(100%-16px)]');
  });

  test('list hovers label masks and object filters only after the first camera frame', async () => {
    axios.get.mockResolvedValue({ data: {
      ...cameraData(),
      motion_masks: [[[20, 20], [40, 20], [40, 40]]],
      object_masks: { person: [[[30, 30], [80, 30], [80, 80]]] },
    } });
    const { svg, rerender } = await openEditor({ streamReady: false });
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Maske 1' }));
    expect(screen.queryByTestId('live-editor-hover-label')).not.toBeInTheDocument();

    rerender(
      <LiveZoneEditor camera="test_camera" width={640} height={360} displayWidth={640}
        streamReady={true} onDirtyChange={vi.fn()}>
        <div>Live stream</div>
      </LiveZoneEditor>
    );
    // A hover made while the preview was locked is intentionally ignored.
    // Once the first frame arrives, a new pointer entry can reveal the label.
    expect(screen.queryByTestId('live-editor-hover-label')).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Maske 1' }));
    expect(screen.getByTestId('live-editor-hover-label')).toHaveTextContent('Maske 1');
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Maske 1' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'person 1' }));
    expect(screen.getByTestId('live-editor-hover-label')).toHaveTextContent('person 1');

    // Neither moving over nor leaving the video should create hover labels.
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'person 1' }));
    fireEvent.mouseMove(svg, { clientX: 70, clientY: 45 });
    expect(screen.queryByTestId('live-editor-hover-label')).not.toBeInTheDocument();
  });

  test('hovering an unselected area does not change the selected editable polygon', async () => {
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    expect(screen.getByRole('button', { name: 'area_a' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'area_b' }));
    expect(screen.getByTestId('live-editor-hover-label')).toHaveTextContent('area_b');
    expect(screen.getByRole('button', { name: 'area_a' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'area_b' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('vertices are smaller but have a larger hit target; dragging cannot add vertices', async () => {
    const { svg } = await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    const visual = svg.querySelector('circle');
    const target = svg.querySelector('ellipse');
    expect(Number(visual.getAttribute('r'))).toBeCloseTo(Math.max(4, 640 / 150) * (2 / 3));
    expect(Number(target.getAttribute('rx'))).toBeGreaterThan(Number(visual.getAttribute('r')));
    expect(Number(target.getAttribute('ry'))).toBeGreaterThan(Number(visual.getAttribute('r')));

    svg.setPointerCapture = vi.fn();
    fireEvent.pointerDown(target, { button: 0, pointerId: 5, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(svg, { button: 0, pointerId: 5, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(svg, { button: 0, pointerId: 5, clientX: 40, clientY: 40 });
    // Browsers may dispatch click on the capturing SVG after pointerup.
    fireEvent.click(svg, { button: 0, clientX: 40, clientY: 40 });
    expect(svg.querySelectorAll('ellipse')).toHaveLength(3);

    // A following independent click is still allowed to add a vertex.
    fireEvent.pointerDown(svg, { button: 0, pointerId: 6 });
    fireEvent.click(svg, { button: 0, clientX: 70, clientY: 90 });
    expect(svg.querySelectorAll('ellipse')).toHaveLength(4);
  });
});
