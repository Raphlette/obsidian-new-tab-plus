import { App, FileView, Plugin, PluginSettingTab, Setting, TFile, View, WorkspaceLeaf } from 'obsidian';

interface NewTabPlusSettings {
  CheckFileCurrentTabs: boolean;
  Delay: number;
  ValideTypes: Set<string>;
  AdditionalValideTypes: string;
}

const DEFAULT_SETTINGS: NewTabPlusSettings = {
  CheckFileCurrentTabs: true,
  Delay: 30,
  ValideTypes: new Set(['markdown', 'graph', 'canvas', 'image', 'video', 'audio', 'pdf']),
  AdditionalValideTypes: '',
};

export default class NewTabPlusPlugin extends Plugin {
  settings: NewTabPlusSettings;

  prevOpenTabs: WorkspaceLeaf[] = [];
  prevTabFilePaths: (string | View)[] = [];
  newOpenTabs: WorkspaceLeaf[] = [];
  newTabFilePaths: (string | View)[] = [];

  isFileProcessed = false;

  prevActiveTab: WorkspaceLeaf | undefined;
  newActiveTab: WorkspaceLeaf | undefined;

  newActiveFilePath: string;

  async onload() {
    await this.loadSettings();

    this.registerDomEvent(window, 'click', this.onClickEvent, {
      capture: true,
    });

    this.registerEvent(this.app.vault.on('delete', this.markFileAsDeleted));
    this.registerEvent(this.app.workspace.on('file-open', this.handleFileOpen));

    this.addSettingTab(new NewTabPlusSettingsTab(this.app, this));
  }

  onunload() {
    this.resetVariables();
  }

  onClickEvent = (event: PointerEvent) => {
    this.isFileProcessed = false;
    this.prevOpenTabs = this.getOpenTabs();
    this.prevTabFilePaths = this.getFilePathsFromTabs(this.prevOpenTabs);
    this.prevActiveTab = this.findActiveTab(this.prevOpenTabs);
  };

  getOpenTabs = (): Array<WorkspaceLeaf> => {
    const leaves: Array<WorkspaceLeaf> = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (this.settings.ValideTypes.has(leaf.view.getViewType())) {
        leaves.push(leaf);
      }
    });

    return leaves;
  };

  getFilePathsFromTabs = (leaves: Array<WorkspaceLeaf>) => {
    return leaves.map((leaf) => {
      if (leaf.view instanceof FileView) {
        return (leaf.view as any).file.path;
      }
      return leaf.view.getState().file;
    });
  };

  findActiveTab = (tabs: WorkspaceLeaf[]) => {
    const activeFile = this.app.workspace.getActiveFile()?.path;
    return tabs.find((leaf) => leaf.view.getState()?.file === activeFile);
  };

  findLastFile = () => {
    const activeFile = this.app.workspace.getActiveFile()?.path;
    const index = this.newOpenTabs.findLastIndex((leaf) => leaf.view.getState()?.file === activeFile);
    return this.newOpenTabs[index];
  };

  markFileAsDeleted = async (): Promise<void> => {
    this.isFileProcessed = true;
  };

  handleFileOpen = (file: TFile) => {
    if (this.isFileProcessed) return;
    this.isFileProcessed = true;

    if (this.prevOpenTabs.length === 0) return;

    this.newOpenTabs = this.getOpenTabs();
    this.newTabFilePaths = this.getFilePathsFromTabs(this.newOpenTabs);
    this.newActiveFilePath = file.path;
    this.newActiveTab = this.findActiveTab(this.newOpenTabs);

    const indexLeaf = this.prevTabFilePaths.findIndex((path) => this.newActiveFilePath == path);

    if (this.newTabFilePaths.length !== this.prevTabFilePaths.length) {
      if (this.newTabFilePaths.length < this.prevTabFilePaths.length) return;
      else {
        if (this.prevTabFilePaths.includes(this.newActiveFilePath) && this.settings.CheckFileCurrentTabs) {
          this.findLastFile()?.detach();

          this.app.workspace.setActiveLeaf(this.prevOpenTabs[indexLeaf], { focus: true });
          this.resetVariables();
          return;
        }
        return;
      }
    }

    if (this.areTabsUnchanged()) return;

    if (indexLeaf !== -1) {
      if (this.prevTabFilePaths.includes(this.newActiveFilePath) && this.settings.CheckFileCurrentTabs) {
        this.executeWithDelay(() => this.openFileInTab(this.app.workspace.getLastOpenFiles()[0], false), this.settings.Delay);

        this.executeWithDelay(() => {
          this.app.workspace.setActiveLeaf(this.prevOpenTabs[indexLeaf], { focus: true });
          this.resetVariables();
        }, this.settings.Delay * 2);
        return;
      }
    }

    this.executeWithDelay(() => this.openFileInTab(this.app.workspace.getLastOpenFiles()[0], false), this.settings.Delay);
    this.executeWithDelay(() => this.openFileInTab(this.newActiveFilePath, true), this.settings.Delay * 2);

    this.resetVariables();
  };

  areTabsUnchanged = () => {
    return this.prevTabFilePaths.length === this.newTabFilePaths.length && this.prevTabFilePaths.every((path, index) => path === this.newTabFilePaths[index]);
  };

  openFileInTab = (path: string, newFile: boolean) => {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      console.warn(`File not found: ${path}`);
      return;
    }
    const leaf = this.app.workspace.getLeaf(newFile);
    leaf.openFile(file as TFile);
  };

  resetVariables = (): void => {
    this.prevOpenTabs = [];
    this.prevTabFilePaths = [];
    this.newOpenTabs = [];
    this.newTabFilePaths = [];
  };

  executeWithDelay = (callback: () => void, delay: number = this.settings.Delay) => {
    setTimeout(callback, delay);
  };

  //#region settings
  async loadSettings() {
    const data = await this.loadData();
    const valideTypes = [...DEFAULT_SETTINGS.ValideTypes, ...data.AdditionalValideTypes.split(',').map((item: string) => item.trim())];
    data.ValideTypes = new Set(valideTypes);
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
  //#endregion
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

    // const desc = document.createDocumentFragment();
    // desc.append('Basic file types are by default opperated by this plugin (markdown, pdf, image, video, audio, graph, canvas). ', desc.createEl('br'), 'If you wish to add a specific file format (coming from another plugin for example), you can add it here. (Reach concerned plugin development team for more information.)');

    // new Setting(containerEl)
    //   .setName('File types')
    //   .setDesc(desc)
    //   .addTextArea((textArea) => {
    //     textArea
    //       .setPlaceholder('fileType1,fileType2')
    //       .setValue(this.plugin.settings.AdditionalValideTypes)
    //       .onChange(async (value) => {
    //         this.plugin.settings.AdditionalValideTypes = value;

    //         await this.plugin.saveSettings();
    //       });
    //   });
  }
}
