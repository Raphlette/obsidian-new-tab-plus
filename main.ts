import { App, FileView, Plugin, PluginSettingTab, Setting, TFile, View, Workspace, WorkspaceLeaf, WorkspaceTabs } from 'obsidian';

interface NewTabPlusSettings {
  CheckFileCurrentTabs: boolean;
}

const DEFAULT_SETTINGS: NewTabPlusSettings = {
  CheckFileCurrentTabs: true,
};

export default class NewTabPlusPlugin extends Plugin {
  settings: NewTabPlusSettings;

  previousFrameOpenLeaves = Array<WorkspaceLeaf>();
  previousFrameFilePaths = Array<string | View>();
  nextFrameOpenLeaves = Array<WorkspaceLeaf>();
  nextFrameFilePaths = Array<string | View>();

  hasClicked = false;

  async onload() {
    await this.loadSettings();

    this.registerDomEvent(window, 'click', this.onClickEvent, {
      capture: true,
    });

    this.app.workspace.on('file-open', this.fileHandler);

    this.addSettingTab(new NewTabPlusSettingsTab(this.app, this));
  }

  onunload() {}

  onClickEvent = async (): Promise<void> => {
    this.hasClicked = false;
    this.previousFrameOpenLeaves = this.getCurrentTabs();
    this.previousFrameFilePaths = await this.getCurrentElementsInTabs(this.previousFrameOpenLeaves);
  };

  getCurrentTabs = (): Array<WorkspaceLeaf> => {
    const leaves: Array<WorkspaceLeaf> = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() == 'markdown' || leaf.view.getViewType() == 'graph' || leaf.view.getViewType() == 'canvas') {
        leaves.push(leaf);
      }
    });

    return leaves;
  };

  getCurrentElementsInTabs = async (leaves: Array<WorkspaceLeaf>): Promise<Array<string | View>> => {
    return leaves.map((leaf) => {
      if (leaf.view instanceof FileView) {
        return (leaf.view as any).file.path;
      }
      return leaf.view;
    });
  };

  fileHandler = async (): Promise<void> => {
    if (this.hasClicked) return;
    if (this.previousFrameOpenLeaves.length === 0) return;
    this.hasClicked = true;
    this.nextFrameOpenLeaves = this.getCurrentTabs();
    this.nextFrameFilePaths = await this.getCurrentElementsInTabs(this.nextFrameOpenLeaves);

    if (this.nextFrameFilePaths.length !== this.previousFrameFilePaths.length) return;
    for (let leaf in this.nextFrameOpenLeaves) {
      if (this.previousFrameFilePaths[leaf] !== this.nextFrameFilePaths[leaf]) {
        if (this.previousFrameFilePaths.contains(this.nextFrameFilePaths[leaf]) && this.settings.CheckFileCurrentTabs) {
          const index = this.previousFrameFilePaths.indexOf(this.nextFrameFilePaths[leaf]);
          await this.updateLeaf(this.previousFrameFilePaths[leaf]);
          this.app.workspace.revealLeaf(this.previousFrameOpenLeaves[index]);
          this.resetVariables();
          return;
        }

        await this.updateLeaf(this.previousFrameFilePaths[leaf]);
        await this.openNewLeaf(this.nextFrameFilePaths[leaf]);
        this.resetVariables();
        break;
      }
    }
  };

  updateLeaf = async (element: string | View): Promise<void> => {
    let oldLeaf = this.app.workspace.getLeaf(false);

    if (element instanceof View) {
      await oldLeaf.setViewState({ type: element.getViewType() });
    } else {
      await this.openFile(element);
    }
  };

  openNewLeaf = async (element: string | View): Promise<void> => {
    let newLeaf = this.app.workspace.getLeaf(true);
    this.app.workspace.revealLeaf(newLeaf);
    this.app.workspace.setActiveLeaf(newLeaf, { focus: true });
    if (element instanceof View) {
      await newLeaf.setViewState({ type: element.getViewType() });
    } else {
      await this.openFile(element);
    }
  };

  openFile = async (path: string, newTab: boolean = false): Promise<void> => {
    await this.app.workspace.openLinkText(path, path, newTab);
  };

  resetVariables = (): void => {
    this.previousFrameOpenLeaves = [];
    this.previousFrameFilePaths = [];
    this.nextFrameOpenLeaves = [];
    this.nextFrameFilePaths = [];
  };

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class NewTabPlusSettingsTab extends PluginSettingTab {
  plugin: NewTabPlusPlugin;

  constructor(app: App, plugin: NewTabPlusPlugin) {
    super(app, plugin);

    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Check if file already open')
      .setDesc('This will check if the file is already open among the tabs and will switch to it if it is.')
      .addToggle((bool) =>
        bool.setValue(this.plugin.settings.CheckFileCurrentTabs).onChange(async (value) => {
          this.plugin.settings.CheckFileCurrentTabs = value;

          await this.plugin.saveSettings();
        }),
      );
  }
}
