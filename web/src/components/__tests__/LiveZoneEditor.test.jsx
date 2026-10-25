import { h } from 'preact';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import LiveZoneEditor from '../LiveZoneEditor';

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
    axios.get.mockReset().mockResolvedValue({ data: cameraData() });
    axios.put.mockReset().mockResolvedValue({ data: { revision: 'revision-2' } });
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      left: 0,
      top: 0,
      width: 640,
      height: 360,
      right: 640,
      bottom: 360,
    }));
  });

  afterEach(() => vi.restoreAllMocks());

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
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Zone' })).not.toBeDisabled());
    const svg = view.container.querySelector('svg');
    return { ...view, svg, onDirtyChange };
  }

  test('overlapping shapes do not intercept clicks intended for the selected zone', async () => {
    const { svg, onDirtyChange } = await openEditor();
    const areaA = screen.getByRole('button', { name: 'area_a' });
    const remove = screen.getByRole('button', { name: 'Bereich löschen' });

    expect(remove).toBeDisabled();
    expect(svg.querySelectorAll('polygon')).toHaveLength(2);
    expect([...svg.querySelectorAll('polygon')].every((p) => p.parentElement.style.pointerEvents === 'none')).toBe(true);

    fireEvent.click(areaA);
    expect(remove).not.toBeDisabled();
    expect(svg.querySelectorAll('ellipse')).toHaveLength(3);

    // This image position is inside area B but must still extend area A.
    fireEvent.click(svg, { button: 0, clientX: 110, clientY: 100 });
    expect(svg.querySelectorAll('ellipse')).toHaveLength(4);
    expect(remove).not.toBeDisabled();
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(true));

    fireEvent.click(areaA); // clicking the active selector toggles it off
    expect(remove).toBeDisabled();
    expect(svg.querySelectorAll('ellipse')).toHaveLength(0);
    fireEvent.click(svg, { button: 0, clientX: 180, clientY: 120 });
    fireEvent.click(areaA);
    expect(svg.querySelectorAll('ellipse')).toHaveLength(4);
  });

  test('deselection keeps unsaved changes and does not require Save', async () => {
    const { svg } = await openEditor();
    const save = screen.getByRole('button', { name: 'Speichern' });
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

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Die Änderungen wurden gespeichert.'));

    expect(areaA).toHaveAttribute('aria-pressed', 'false');
    expect(svg.querySelectorAll('ellipse')).toHaveLength(0);
    expect(svg.querySelectorAll('polygon')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Bearbeitung beenden' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bereich löschen' })).toBeDisabled();
  });

  test('group headings and selected and unselected area buttons use 14px text', async () => {
    await openEditor();
    expect(screen.getByRole('heading', { name: 'Zonen (2)' })).toHaveClass('text-sm');
    expect(screen.getByRole('heading', { name: 'Abgedeckte Bereiche (0)' })).toHaveClass('text-sm');
    expect(screen.getByRole('heading', { name: 'Objektfilter (0)' })).toHaveClass('text-sm');
    const areaA = screen.getByRole('button', { name: 'area_a' });
    expect(areaA).toHaveClass('text-sm');
    fireEvent.click(areaA);
    expect(areaA).toHaveClass('text-sm');
  });

  test('keeps the grouped tools visible on mobile in a fixed 330px desktop sidebar', async () => {
    const { container } = await openEditor();
    const panel = screen.getByRole('complementary', { name: 'Werkzeuge und Bereiche' });

    expect(panel).toHaveClass('xl:order-last', 'xl:w-[330px]');
    expect(screen.getByRole('heading', { name: 'Bearbeitungsmenü' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bearbeitungsmenü/ })).not.toBeInTheDocument();
    expect(container.querySelector('#live-polygon-tools')).toHaveClass('space-y-3');
    expect(container.querySelector('#live-polygon-tools')).not.toHaveClass('hidden');
    expect(screen.getByRole('heading', { name: 'Neuer Bereich erstellen' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vorhandene Bereiche (2)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ausgewählter Bereich' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Zonen (2)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Abgedeckte Bereiche (0)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Objektfilter (0)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'area_a' })).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('.xl\\:order-first')).not.toBeNull();
  });

  test('shows an accessible bold white 16px dirty notice and a matching green save confirmation', async () => {
    const { svg } = await openEditor();
    expect(screen.queryByText('Nicht gespeicherte Änderungen')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    fireEvent.click(svg, { button: 0, clientX: 35, clientY: 90 });
    const warning = screen.getByRole('status');
    expect(warning).toHaveTextContent('Nicht gespeicherte Änderungen');
    expect(warning).toHaveClass('mb-4');
    expect(warning.firstElementChild).toHaveClass('font-bold', 'text-white', 'text-base');
    expect(warning.firstElementChild).not.toHaveClass('text-lg');
    expect(warning.querySelector('svg[stroke="currentColor"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(1));

    const saved = screen.getByRole('status');
    expect(saved).toHaveClass('mb-4');
    expect(saved.firstElementChild).toHaveClass('text-green-400', 'text-base');
    expect(saved.firstElementChild).not.toHaveClass('text-white');
    expect(saved).toHaveTextContent('Die Änderungen wurden gespeichert. Ein Neustart von Frigate ist erforderlich.');
    expect(saved.querySelector('strong')).toHaveTextContent('Ein Neustart von Frigate ist erforderlich.');
    expect(saved.querySelector('svg[stroke="currentColor"]')).not.toBeNull();
    expect(screen.queryByText('Nicht gespeicherte Änderungen')).not.toBeInTheDocument();
  });

  test('uses matching yellow warning text/icon and red error text/icon', async () => {
    const { svg } = await openEditor();
    vi.spyOn(window, 'prompt').mockReturnValueOnce('invalid name').mockReturnValueOnce('valid_zone');

    fireEvent.click(screen.getByRole('button', { name: '+ Zone' }));
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Der eingegebene Zonenname ist ungültig. Bitte verwende ausschließlich Buchstaben, Zahlen und Unterstriche.');
    expect(error.firstElementChild).toHaveClass('text-red-400', 'text-base');
    expect(error.querySelector('svg[stroke="currentColor"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '+ Zone' }));
    expect(screen.queryByText(/Mindestens drei Eckpunkte/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Zum Zeichnen ins Videobild klicken/)).not.toBeInTheDocument();
    expect(screen.getByText('Nicht gespeicherte Änderungen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    const invalid = screen.getByText(/Die Zone „valid_zone“ kann nicht gespeichert werden/).closest('[role="alert"]');
    expect(invalid).toHaveClass('mb-4');
    expect(invalid.firstElementChild).toHaveClass('text-yellow-300', 'text-base');
    expect(invalid.querySelector('svg[stroke="currentColor"]')).not.toBeNull();
    expect(axios.put).not.toHaveBeenCalled();
    expect(svg.querySelectorAll('ellipse')).toHaveLength(0);
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
    expect(screen.getByRole('heading', { name: 'Abgedeckte Bereiche (1)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Objektfilter (1)' })).toBeInTheDocument();
  });

  test('failed API writes show red errors while the unsaved indicator remains visible', async () => {
    axios.put.mockRejectedValueOnce({ response: { data: { message: 'Speichern fehlgeschlagen' } } });
    const { svg } = await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'area_a' }));
    fireEvent.click(svg, { button: 0, clientX: 35, clientY: 90 });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(screen.getByText('Speichern fehlgeschlagen')).toBeInTheDocument());
    const error = screen.getByRole('alert');
    expect(error.firstElementChild).toHaveClass('text-red-400');
    expect(error.querySelector('svg[stroke="currentColor"]')).not.toBeNull();
    expect(screen.getByText('Nicht gespeicherte Änderungen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'area_a' })).toHaveAttribute('aria-pressed', 'true');
    expect(svg.querySelectorAll('ellipse')).toHaveLength(4);
  });

  test('duplicate zone names have their own complete error sentence', async () => {
    await openEditor();
    vi.spyOn(window, 'prompt').mockReturnValue('area_a');
    fireEvent.click(screen.getByRole('button', { name: '+ Zone' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Eine Zone mit diesem Namen ist bereits vorhanden. Bitte wähle einen anderen Zonennamen.');
    expect(axios.put).not.toHaveBeenCalled();
  });

  test.each([
    ['mask', '+ Maske', 'Der abgedeckte Bereich „Maske 1“ kann nicht gespeichert werden.'],
    ['object', '+ Objektfilter', 'Der Objektfilter „person 1“ kann nicht gespeichert werden.'],
  ])('new %s starts without premature warnings and validates only on Save', async (_, buttonName, expected) => {
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: buttonName }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Nicht gespeicherte Änderungen')).toBeInTheDocument();
    expect(screen.queryByText('Zum Zeichnen ins Videobild klicken')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByRole('alert')).toHaveTextContent(expected);
    expect(axios.put).not.toHaveBeenCalled();
  });

  test('hides polygons and vertex hit targets until a video frame is available', async () => {
    const { container, rerender, svg } = await openEditor({ streamReady: false });
    expect(screen.getByText('Livebild wird geladen …')).toBeInTheDocument();
    expect(svg.querySelectorAll('polygon')).toHaveLength(0);
    expect(svg).toHaveClass('invisible', 'pointer-events-none');

    rerender(
      <LiveZoneEditor camera="test_camera" width={640} height={360} displayWidth={640}
        streamReady={true} onClose={vi.fn()} onDirtyChange={vi.fn()}>
        <div>Live stream</div>
      </LiveZoneEditor>
    );
    expect(screen.queryByText('Livebild wird geladen …')).not.toBeInTheDocument();
    expect(container.querySelector('svg').querySelectorAll('polygon')).toHaveLength(2);
    expect(container.querySelector('svg')).not.toHaveClass('invisible');
  });

  test('compact object-class select and no selection checkmark', async () => {
    await openEditor();
    expect(screen.getByRole('combobox', { name: 'Objektklasse' })).toHaveClass('w-[145px]');
    expect(screen.getByRole('combobox', { name: 'Objektklasse' })).not.toHaveClass('flex-1');
    const area = screen.getByRole('button', { name: 'area_a' });
    fireEvent.click(area);
    expect(area).toHaveAttribute('aria-pressed', 'true');
    expect(area.textContent).toBe('area_a');
    expect(screen.getByRole('heading', { name: 'Vorhandene Bereiche (2)' })).toBeInTheDocument();
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
