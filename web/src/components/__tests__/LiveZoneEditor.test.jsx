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
    const areaA = screen.getByRole('button', { name: 'Zone: area_a' });
    const remove = screen.getByRole('button', { name: 'Bereich löschen' });

    expect(remove).toBeDisabled();
    expect(svg.querySelectorAll('polygon')).toHaveLength(2);
    expect([...svg.querySelectorAll('polygon')].every((p) => p.parentElement.getAttribute('pointer-events') === 'none')).toBe(true);

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
    fireEvent.click(screen.getByRole('button', { name: 'Zone: area_a' }));
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

  test('vertices are smaller but have a larger hit target; dragging cannot add vertices', async () => {
    const { svg } = await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Zone: area_a' }));
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
