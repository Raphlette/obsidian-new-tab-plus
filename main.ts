import { App, FileView, Plugin, PluginSettingTab, Setting, TFile, View, WorkspaceLeaf } from 'obsidian';

interface NewTabPlusSettings {
  CheckFileCurrentTabs: boolean;
  Delay: number;
}

const DEFAULT_SETTINGS: NewTabPlusSettings = {
  CheckFileCurrentTabs: true,
  Delay: 30,
};

export default class NewTabPlusPlugin extends Plugin {
  settings: NewTabPlusSettings;

  previousFrameOpenLeaves = Array<WorkspaceLeaf>();
  previousFrameFilePaths = Array<string | View>();
  nextFrameOpenLeaves = Array<WorkspaceLeaf>();
  nextFrameFilePaths = Array<string | View>();

  oldLeaf: WorkspaceLeaf;

  fileHandled = false;

  async onload() {
    await this.loadSettings();

    this.registerDomEvent(window, 'click', this.onClickEvent, {
      capture: true,
    });

    this.registerEvent(this.app.vault.on('delete', this.deleteFile));
    this.registerEvent(this.app.workspace.on('file-open', this.fileHandler));

    this.addSettingTab(new NewTabPlusSettingsTab(this.app, this));
  }

  onunload() {}

  onClickEvent = async (): Promise<void> => {
    this.fileHandled = false;
    this.previousFrameOpenLeaves = this.getCurrentTabs();
    this.previousFrameFilePaths = await this.getCurrentElementsInTabs(this.previousFrameOpenLeaves);
  };

  getCurrentTabs = (): Array<WorkspaceLeaf> => {
    const leaves: Array<WorkspaceLeaf> = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() == 'markdown' || leaf.view.getViewType() == 'graph' || leaf.view.getViewType() == 'canvas' || leaf.view.getViewType() == 'image') {
        leaves.push(leaf);
      }
    });

    return leaves;
  };

  getCurrentElementsInTabs = (leaves: Array<WorkspaceLeaf>) => {
    return leaves.map((leaf) => {
      if (leaf.view instanceof FileView) {
        return (leaf.view as any).file.path;
      }
      return leaf.view;
    });
  };

  deleteFile = async (): Promise<void> => {
    this.fileHandled = true;
  };

  fileHandler = () => {
    if (this.fileHandled) return;
    if (this.previousFrameOpenLeaves.length === 0) return;
    this.fileHandled = true;
    this.nextFrameOpenLeaves = this.getCurrentTabs();
    this.nextFrameFilePaths = this.getCurrentElementsInTabs(this.nextFrameOpenLeaves);

    if (this.nextFrameFilePaths.length !== this.previousFrameFilePaths.length) return;
    for (let leaf in this.nextFrameOpenLeaves) {
      if (this.previousFrameFilePaths[leaf] !== this.nextFrameFilePaths[leaf]) {
        this.oldLeaf = this.app.workspace.getActiveViewOfType(View)?.leaf as WorkspaceLeaf;
        if (this.previousFrameFilePaths.contains(this.nextFrameFilePaths[leaf]) && this.settings.CheckFileCurrentTabs) {
          const index = this.previousFrameFilePaths.indexOf(this.nextFrameFilePaths[leaf]);
          setTimeout(() => {
            this.openOldFile(this.previousFrameFilePaths[leaf]);
            this.app.workspace.revealLeaf(this.previousFrameOpenLeaves[index]);
            this.resetVariables();
            this.app.workspace.setActiveLeaf(this.previousFrameOpenLeaves[index], { focus: true });
          }, this.settings.Delay);
          return;
        }

        setTimeout(() => {
          this.openOldFile(this.previousFrameFilePaths[leaf]);
          this.openNewFile(this.nextFrameFilePaths[leaf]);
        }, this.settings.Delay);
        break;
      }
    }
  };

  openOldFile = (element: string | View) => {
    if (element instanceof View) {
      this.oldLeaf.open(element);
      this.oldLeaf.setViewState({ type: element.getViewType() });
    } else {
      const file = this.app.vault.getAbstractFileByPath(element as string);
      this.oldLeaf.openFile(file as TFile, { active: true });
    }
  };

  openNewFile = async (element: string | View): Promise<void> => {
    let newLeaf = this.app.workspace.getLeaf(true);
    this.app.workspace.revealLeaf(newLeaf);
    if (element instanceof View) {
      newLeaf.open(element);
      newLeaf.setViewState({ type: element.getViewType() });
    } else {
      const file = this.app.vault.getAbstractFileByPath(element as string);
      newLeaf.openFile(file as TFile);
      this.app.workspace.setActiveLeaf(newLeaf, { focus: true });
    }
    this.app.workspace.revealLeaf(newLeaf);
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

    new Setting(containerEl)
      .setName('Delay to execute (ms)')
      .setDesc('Default value: 30. You might want to cramp it up a little if you experience misbehaviors')
      .addSlider((slider) => {
        slider.setLimits(10, 100, 10);
        slider.setValue(this.plugin.settings.Delay).onChange(async (value) => {
          this.plugin.settings.Delay = value;

          await this.plugin.saveSettings();
        });
      });
  }
}
