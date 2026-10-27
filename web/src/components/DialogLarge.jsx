import { h } from 'preact';
import Dialog from './Dialog';

// Retain the shared large-dialog API while using the same responsive,
// accessible surface and focus handling as regular confirmation prompts.
export default function LargeDialog({ children, portalRootID = 'dialogs' }) {
  return <Dialog portalRootID={portalRootID} size="lg">{children}</Dialog>;
}
