/// <reference path='./inquirer-autocomplete-prompt.d.ts' />
/// <reference path='./inquirer-datepicker-prompt.d.ts' />

const CONFIG_FILE = 'config.json';

import figlet from 'figlet';
import inquirer from 'inquirer';
import autocomplete from 'inquirer-autocomplete-prompt';
import datepicker from 'inquirer-datepicker-prompt';
import Fuse from 'fuse.js';

import path from 'path';
import { program } from 'commander';
import fs from 'fs-extra';

import { Liquid } from 'liquidjs';
import slugify from 'slugify';

const engine = new Liquid();

inquirer.registerPrompt('autocomplete', autocomplete);
inquirer.registerPrompt('datepicker', datepicker);

interface Answer {
    team: string;
    name: string;
    date: Date;
    message: string;
    picture: string;
}

interface Team {
    name: string;
    slug: string;
    deserters: Deserter[];
}
interface Deserter {
    name: string;
    slug: string;
    date: Date;
    message: string;
    picture: string;
}

interface Config {
    title: string;
    description: string;
    author: string;
    daysMessage: string;
    teams: Team[];
}

function getBanner(): Promise<string> {
    var promise = new Promise<string>((resolve, reject) => {
        figlet.text('Rip Life', 'Caligraphy', (error, result) => {
            if (!error) {
                resolve(result);
            }
            reject(error);
        });
    });
    return promise;
}

async function getConfig(): Promise<Config> {
    const file = await fs.readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(file) as Config;
    return config;
}

async function saveConfig(config: Config): Promise<void> {
    const cfg = JSON.stringify(config, null, 4);
    await fs.writeFile(CONFIG_FILE, cfg);
}

function searchTeams(input: string, fuse: Fuse<Team>): Team[] {
    input = input ? input : '';
    const fuseResult = fuse.search(input);
    const searchResult = fuseResult.map((f) => f.item);
    const res = { name: input, slug: slugify(input, { lower: true }), deserters: [] };
    if (searchResult.length < 1) {
        return [res];
    }
    searchResult.push(res);
    return searchResult;
}

async function addTeamIfNotExists(teamname: string, config: Config): Promise<Config> {
    if (config.teams.filter((t) => t.name == teamname).length === 0) {
        config.teams.push({
            name: teamname,
            slug: slugify(teamname, {
                lower: true,
            }),
            deserters: [],
        });
        await saveConfig(config);
    }
    return config;
}

async function addDeserterIfNotExists(answers: Answer, config: Config): Promise<Config> {
    const team = config.teams.find((t) => t.name == answers.team);
    if (!team) {
        config = await addTeamIfNotExists(answers.team, config);
        return await addDeserterIfNotExists(answers, config);
    }

    if (!team.deserters.find((d) => d.name === answers.name && d.date === answers.date)) {
        const deserter = {
            ...answers,
            slug: slugify(answers.name, {
                lower: true,
            }),
        };
        team.deserters.push(deserter);
        await saveConfig(config);
    }
    return config;
}

async function addDeserter(): Promise<Config> {
    console.log(await getBanner());
    let config = await getConfig();
    const fuse = new Fuse(config.teams, {
        keys: ['name'],
    });

    const answers: Answer = await inquirer.prompt([
        {
            type: 'autocomplete',
            name: 'team',
            message: 'For which team do you want to generate a page?',
            source: function (_: string[], input: string) {
                return searchTeams(input, fuse);
            },
        },
        {
            name: 'name',
            message: 'For whom would you like to generate a page?',
        },
        {
            name: 'date',
            message: 'When will they leave your team?',
            type: 'datepicker',
            format: ['yyyy', '-', 'mm', '-', 'dd'],
        },
        {
            name: 'message',
            message: 'What message would you like to display?',
        },
        {
            name: 'picture',
            message: 'Which picture would you like to use? <enter url>',
        },
    ]);
    answers.date.setHours(0, 0, 0, 0);
    config = await addTeamIfNotExists(answers.team, config);
    config = await addDeserterIfNotExists(answers, config);
    return config;
}

async function buildSite(): Promise<void> {
    console.log(await getBanner());
    const config = await getConfig();
    console.info(`Building ${config.title}...`);

    await fs.remove('public');
    await fs.mkdir('public');

    const template = await fs.readFile(path.join('templates', 'index.liquid'), 'utf-8');
    const teamTemplate = await fs.readFile(path.join('templates', 'team.liquid'), 'utf-8');
    const deserterTemplate = await fs.readFile(path.join('templates', 'person.liquid'), 'utf-8');

    const index = await engine.parseAndRender(template, config);
    await fs.writeFile(path.join('public', 'index.html'), index);
    console.info('Creating index...');
    for (const team of config.teams) {
        await fs.mkdir(path.join('public', team.slug));
        const teamScope = {
            title: `${config.title} - ${team.name}`,
            description: config.description,
            author: config.author,
            team: team,
        };
        const index = await engine.parseAndRender(teamTemplate, teamScope);
        console.info(`Creating index for ${team.name}...`);
        await fs.writeFile(path.join('public', team.slug, 'index.html'), index);

        for (const deserter of team.deserters) {
            console.info(`Creating page for ${deserter.name}...`);
            const deserterScope = {
                title: `${config.title} - ${team.name} - ${deserter.name}`,
                description: config.description,
                author: config.author,
                team: team.name,
                daysMessage: config.daysMessage,
                deserter: deserter,
            };
            const deserterPage = await engine.parseAndRender(deserterTemplate, deserterScope);
            await fs.writeFile(path.join('public', team.slug, `${deserter.slug}.html`), deserterPage);
        }
    }

    console.info('Copying assets...');
    await fs.copy('assets', 'public');
    console.info('Done!');
}

async function init(): Promise<void> {
    console.log(await getBanner());
    console.log('Initializing assets...');
    await fs.ensureDir('assets');
    await fs.ensureDir(path.join('assets', 'css'));
    await fs.ensureDir(path.join('assets', 'img'));
    await fs.ensureDir(path.join('assets', 'js'));

    const baseStyle = `BASE_STYLE`.slice(1, -1);
    const baseScript = `BASE_SCRIPT`.slice(1, -1);
    const baseTemplate = `BASE_TEMPLATE`.slice(1, -1);
    const indexTemplate = `INDEX_TEMPLATE`.slice(1, -1);
    const teamTemplate = `TEAM_TEMPLATE`.slice(1, -1);
    const personTemplate = `PERSON_TEMPLATE`.slice(1, -1);

    const cssPath = path.join('assets', 'css', 'styles.css');
    if (!(await fs.pathExists(cssPath))) {
        await fs.writeFile(cssPath, baseStyle);
    }

    const jsPath = path.join('assets', 'js', 'index.js');
    if (!(await fs.pathExists(jsPath))) {
        await fs.writeFile(jsPath, baseScript);
    }

    console.log('Initializing templates...');
    await fs.ensureDir('templates');

    const baseTemplatePath = path.join('templates', 'baseof.liquid');
    if (!(await fs.pathExists(baseTemplatePath))) {
        await fs.writeFile(baseTemplatePath, baseTemplate);
    }

    const indexTemplatePath = path.join('templates', 'index.liquid');
    if (!(await fs.pathExists(indexTemplatePath))) {
        await fs.writeFile(indexTemplatePath, indexTemplate);
    }

    const teamTemplatePath = path.join('templates', 'team.liquid');
    if (!(await fs.pathExists(teamTemplatePath))) {
        await fs.writeFile(teamTemplatePath, teamTemplate);
    }

    const personTemplatePath = path.join('templates', 'person.liquid');
    if (!(await fs.pathExists(personTemplatePath))) {
        await fs.writeFile(personTemplatePath, personTemplate);
    }

    console.log('Initializing config...');
    const configPath = CONFIG_FILE;
    if (!(await fs.pathExists(configPath))) {
        const config = {
            title: '',
            description: '',
            author: '',
            daysMessage: '{days} since {name} left {team}',
            teams: [],
        };
        await saveConfig(config);
    }
    console.log('Done!');
}

program.name('riplife').version('1.0.0');
program.command('init').description('Setup the directory for usages with riplife').action(init);
program.command('build').description('Build the static pages').action(buildSite);
program
    .command('add')
    .description('Add a new team member that left your team to the config')
    .action(async () => {
        await addDeserter();
    });

program.action(async () => {
    console.log(await getBanner());
    program.help();
});
program.parse(process.argv);
