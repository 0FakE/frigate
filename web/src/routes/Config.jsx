import { h } from 'preact';
import useSWR from 'swr';
import { useApiHost } from '../api';
import ActivityIndicator from '../components/ActivityIndicator';
import Heading from '../components/Heading';
import { useEffect, useRef, useState } from 'preact/hooks';
import Button from '../components/Button';
import { editor, Uri } from 'monaco-editor';
import { setDiagnosticsOptions } from 'monaco-yaml';
import copy from 'copy-to-clipboard';
import { setSyncedConfigContents, syncConfigModel } from '../utils/configModelSync';
import { saveConfigAndMaybeRestart } from '../util/configSaveRestart';

export default function Config() {
  const apiHost = useApiHost();

  const { data: config, mutate: updateRawConfig } = useSWR('config/raw', { revalidateOnMount: true });
  const [success, setSuccess] = useState();
  const [error, setError] = useState();
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);

  const onHandleSaveConfig = async (e, save_option) => {
    if (e) {
      e.stopPropagation();
    }
    // The shared Button uses a div, so prevent duplicate submissions here.
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);

    try {
      const submittedConfig = window.editor.getValue();
      const message = await saveConfigAndMaybeRestart(submittedConfig, save_option, () => {
        const model = window.editor?.getModel();
        if (model) setSyncedConfigContents(model, submittedConfig);
        updateRawConfig(submittedConfig, false);
      });
      setError('');
      setSuccess(message);
    } catch (error) {
      setSuccess('');
      setError(error.response?.data?.message || error.message);
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  const handleCopyConfig = async () => {
    copy(window.editor.getValue());
  };

  useEffect(() => {
    if (typeof config !== 'string') return;
    const container = document.getElementById('container');
    if (!container) return;

    const modelUri = Uri.parse('a://b/api/config/schema.json');
    let yamlModel = editor.getModel(modelUri);
    if (!yamlModel) {
      yamlModel = editor.createModel(config, 'yaml', modelUri);
      setSyncedConfigContents(yamlModel, config);
    } else {
      syncConfigModel(yamlModel, config);
    }

    if (container.children.length > 0) return;

    setDiagnosticsOptions({
      enableSchemaRequest: true,
      hover: true,
      completion: true,
      validate: true,
      format: true,
      schemas: [
        {
          uri: `${apiHost}api/config/schema.json`,
          fileMatch: [String(modelUri)],
        },
      ],
    });

    window.editor = editor.create(container, {
      language: 'yaml',
      model: yamlModel,
      scrollBeyondLastLine: false,
      theme: 'vs-dark',
    });
  }, [config, apiHost]);

  useEffect(() => () => {
    // Reuse the YAML model, but not a Monaco widget attached to an old page.
    window.editor?.dispose();
    window.editor = null;
  }, []);

  if (!config) {
    return <ActivityIndicator />;
  }

  return (
    <div className="space-y-4 p-2 px-4 h-full">
      <div className="flex justify-between">
        <Heading>Config</Heading>
        <div>
          <Button className="mx-2" onClick={(e) => handleCopyConfig(e)}>
            Copy Config
          </Button>
          <Button className="mx-2" disabled={saving} onClick={(e) => onHandleSaveConfig(e, 'restart')}>
            Save & Restart
          </Button>
          <Button className="mx-2" disabled={saving} onClick={(e) => onHandleSaveConfig(e, 'saveonly')}>
            Save Only
          </Button>
        </div>
      </div>

      {success && <div className="max-h-20 text-green-500">{success}</div>}
      {error && <div className="p-4 overflow-scroll text-red-500 whitespace-pre-wrap">{error}</div>}

      <div id="container" className="h-full" />
    </div>
  );
}
