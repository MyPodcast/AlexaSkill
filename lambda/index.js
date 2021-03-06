/* **
 * ****************************************************************************************************************
 * Skill : MyPodcast
 * Version : 1.4.5
 * Authors : Evann DREUMONT
 *              backend : Github gist hosting podcast url, gist link and auto recovery with account linking
 *                        web site for editing, updating podcasts list &
 *           Benjamin DREUMONT
 *              frontend : Alexa's build skill, Intent, Audioplayer Handling
 * ----------------------------------------------------------------------------------------------------------------
 * Updates :
 *              - 24/01/2021 v1.1.0 Initial Release
 *              - 25/01/2021 v1.2.0 Handling controls on screen device and adding AudioMetadata Picture for screens
 *                                  Debbuging getGithubtoken function
 *              - 31/01/2021 v1.3.0 Handling Podcast changing to the next at the end of one podcast + Logger
 *              - 07/02/2021 v1.4.0 LastPodcast Handling finalized
 *                                  Enhance Alexa dialogue experience (Bonjour/Bonsoir Time control)
 *                                  welcome with last playback play proposing if no enumerating the list as before
 *
 *
 * ****************************************************************************************************************
 * */

// ****************************************************************************************************************
// LIBRARY AND CONSTANTS
// ****************************************************************************************************************
const axios = require("axios");
const Alexa = require("ask-sdk-core");
const Logger = require("./logger");

// ----------------------------------------------------------------------------------------------------------------
// Test Constants to delete after
// ----------------------------------------------------------------------------------------------------------------
var username = "";
var gist = null;
var podcasts = null;

//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// TODO LIST :
// + Message alexa à l'ouverture Le dernier podcats joué à partir du timestamp!... searchLastPodcast(podcasts) demander le dernier podcast joué?
// + Ajouter la fonctionnalité Alexa joue mon dernier podcast. OK FAIT
// + Dialogue la dernière fois vous jouiez tel morceau voulez vous reprendre? oui ou non si non liste des podcasts
// - Faire une fonction regroupant l'ensemble des requete pour les différents type genre StartPodcast et StopPodcast
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

// ****************************************************************************************************************
// INTENTS MANAGE
// ****************************************************************************************************************

// ----------------------------------------------------------------------------------------------------------------
// Intent LaunchRequest : Welcome part ALexe propose of continuig Last podcast(yes) or enumerate lits (no)
// ----------------------------------------------------------------------------------------------------------------
const LaunchRequestHandler = {
	canHandle(handlerInput) {
		return handlerInput.requestEnvelope.request.type === "LaunchRequest";
	},
	async handle(handlerInput) {
		var heure = new Date();
		heure = heure.getHours();
		let hello;
		heure > "19" ? (hello = "Bonsoir") : (hello = "Bonjour");
		const i = searchLastPodcast(podcasts);
		Logger.log("Dernier morceau joué", i);
		if (i || i === 0) {
			return handlerInput.responseBuilder
				.speak(
					`${hello} ${username}, voulez vous reprendre la dernière lecture ?`
				)
				.reprompt(`Voulez vous reprendre là ou vous en étiez?`)
				.getResponse();
		} else {
			let podcastsNames = getNames();
			return handlerInput.responseBuilder
				.speak(
					`${hello} ${username}, voici les ${podcastsNames.number} podcasts de ce soir : ${podcastsNames.names}. Quel numéro de titre voulez vous jouer ?`
				)
				.reprompt(`Quel morceau voulez vous jouer ?`)
				.getResponse();
		}
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent No : in response of Launch Request if no then enumerate podcasts list
// ----------------------------------------------------------------------------------------------------------------

const NoHandler = {
	canHandle(handlerInput) {
		return (
			handlerInput.requestEnvelope.request.intent.name ===
			"AMAZON.NoIntent"
		);
	},
	async handle(handlerInput) {
		let podcastsNames = getNames();
		return handlerInput.responseBuilder
			.speak(
				`OK, voici les ${podcastsNames.number} podcasts de ce soir : ${podcastsNames.names}. Quel numéro de titre voulez vous jouer ?`
			)
			.reprompt(`Quel morceau voulez vous jouer ?`)
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent Restart : restart from begining the played podcast
// ----------------------------------------------------------------------------------------------------------------
const RestartSoundHandler = {
	canHandle(handlerInput) {
		return (
			handlerInput.requestEnvelope.request.type === "IntentRequest" &&
			(handlerInput.requestEnvelope.request.intent.name ===
				"RestartIntent" ||
				handlerInput.requestEnvelope.request.intent.name ===
					"AMAZON.NavigateHomeIntent" ||
				handlerInput.requestEnvelope.request.intent.name ===
					"AMAZON.StartOverIntent")
		);
	},

	async handle(handlerInput) {
		const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
		const i = searchPodcast(AudioPlayer, podcasts);
		return handlerInput.responseBuilder
			.speak(`Je reprends au début : ${podcasts[i].name}`)
			.addAudioPlayerPlayDirective(
				"REPLACE_ALL",
				podcasts[i].url,
				podcasts[i].id ? podcasts[i].id : podcasts[i].url,
				0,
				null,
				setAudioMetadata(podcasts[i])
			)
			.withSimpleCard(
				podcasts[i].name,
				podcasts[i].synopsis ? podcasts[i].synopsis : ""
			)
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent TitleIntent : Play the title number of the podcasts list
// ----------------------------------------------------------------------------------------------------------------
const TitleHandler = {
	canHandle(handlerInput) {
		return (
			handlerInput.requestEnvelope.request.type === "IntentRequest" &&
			handlerInput.requestEnvelope.request.intent.name === "TitleIntent"
		);
	},
	async handle(handlerInput) {
		let podcastnumber =
			handlerInput.requestEnvelope.request.intent.slots.Title.value - 1;
		let state = "";
		if (podcasts[podcastnumber]) {
			if (podcasts[podcastnumber].state === "in_read") {
				state = "reprends";
			} else {
				state = "joue";
			}
			return handlerInput.responseBuilder
				.speak(
					`OK je ${state} le titre ${
						podcastnumber + 1
					} <break time="1s"/> ${
						podcasts[podcastnumber].name
							? podcasts[podcastnumber].name
							: "Sans Titre"
					}`
				)
				.addAudioPlayerPlayDirective(
					"REPLACE_ALL",
					podcasts[podcastnumber].url,
					podcasts[podcastnumber].id
						? podcasts[podcastnumber].id
						: podcasts[podcastnumber].url,
					podcasts[podcastnumber].offset,
					null,
					setAudioMetadata(podcasts[podcastnumber])
				)
				.withSimpleCard(
					podcasts[podcastnumber].name
						? podcasts[podcastnumber].name
						: "Sans Titre",
					podcasts[podcastnumber].synopsis
						? podcasts[podcastnumber].synopsis
						: ""
				)
				.getResponse();
		} else {
			return handlerInput.responseBuilder
				.speak(
					`Le titre ${
						podcastnumber + 1
					} n'existe pas ! Quel titre voulez vous jouer ?`
				)
				.reprompt(`Quel titre voulez vous jouer ?`)
				.getResponse();
		}
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent SynopsisIntent : Tell us about th synopsis or resume of the podcast
// ----------------------------------------------------------------------------------------------------------------
const SynopsisHandler = {
	canHandle(handlerInput) {
		return (
			handlerInput.requestEnvelope.request.type === "IntentRequest" &&
			handlerInput.requestEnvelope.request.intent.name ===
				"SynopsisIntent"
		);
	},
	async handle(handlerInput) {
		let podcastnumber =
			handlerInput.requestEnvelope.request.intent.slots.SynTitle.value -
			1;
		return handlerInput.responseBuilder
			.speak(
				`Le résumé du titre ${podcastnumber + 1} ${
					podcasts[podcastnumber].name
						? podcasts[podcastnumber].name
						: "Sans Titre"
				} est ${
					podcasts[podcastnumber].synopsis
						? podcasts[podcastnumber].synopsis
						: `. Désolé il n'y a pas de résumé pour ce Titre.`
				}`
			)
			.withSimpleCard(
				podcasts[podcastnumber].name
					? podcasts[podcastnumber].name
					: "Sans Titre",
				podcasts[podcastnumber].synopsis
					? podcasts[podcastnumber].synopsis
					: ""
			)
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent Stop/CancelIntent : Stop the skil
// ----------------------------------------------------------------------------------------------------------------
const ExitHandler = {
	canHandle(handlerInput) {
		const request = handlerInput.requestEnvelope.request;

		return (
			request.type === "IntentRequest" &&
			(request.intent.name === "AMAZON.StopIntent" ||
				request.intent.name === "AMAZON.CancelIntent")
		);
	},
	handle(handlerInput) {
		return handlerInput.responseBuilder
			.addAudioPlayerStopDirective()
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent SessionlIntent : Ending the skill
// ----------------------------------------------------------------------------------------------------------------
const SessionEndedRequestHandler = {
	canHandle(handlerInput) {
		return (
			handlerInput.requestEnvelope.request.type === "SessionEndedRequest"
		);
	},
	handle(handlerInput) {
		//any cleanup logic goes here

		return handlerInput.responseBuilder
			.speak(`Bonne nuit ! à bientôt pour de nouveaux podcasts!`)
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent PauseIntent : Pause the played podcast
// ----------------------------------------------------------------------------------------------------------------
const PausePlaybackHandler = {
	canHandle(handlerInput) {
		const request = handlerInput.requestEnvelope.request;

		return (
			request.type === "IntentRequest" &&
			request.intent.name === "AMAZON.PauseIntent"
		);
	},
	async handle(handlerInput) {
		const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
		const offset = AudioPlayer.offsetInMilliseconds;
		const token = getGithubToken(handlerInput);
		const i = searchPodcast(AudioPlayer, podcasts);
		podcasts[i].offset = offset;
		podcasts[i].state = "in_read";
		podcasts[i].lastopen = handlerInput.requestEnvelope.request.timestamp;
		UpdatePodcasts(podcasts, gist.url, token);
		return handlerInput.responseBuilder
			.addAudioPlayerStopDirective()
			.speak(`Lecture en pause`) // à supprimer en prod
			.withSimpleCard(podcasts[i].name, "Pause")
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent ResumePlaybackIntent : resume the last played podcast
// ----------------------------------------------------------------------------------------------------------------
const ResumePlaybackHandler = {
	canHandle(handlerInput) {
		const request = handlerInput.requestEnvelope.request;

		return (
			request.type === "IntentRequest" &&
			request.intent.name === "AMAZON.ResumeIntent"
		);
	},
	async handle(handlerInput) {
		const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
		const offset = AudioPlayer.offsetInMilliseconds;
		const podcast = getPodcast(AudioPlayer, podcasts);
		return handlerInput.responseBuilder
			.speak("La lecture reprend") // à supprimer en prod
			.addAudioPlayerPlayDirective(
				"REPLACE_ALL",
				podcast.url,
				podcast.id ? podcast.id : podcast.url,
				offset - 1000,
				null
			)
			.withSimpleCard(podcast.name, "reprise de la lecture")
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent NextPlaybackIntent : play next podcast of the podcasts list
// ----------------------------------------------------------------------------------------------------------------
const NextPlaybackHandler = {
	canHandle(handlerInput) {
		const request = handlerInput.requestEnvelope.request;

		return (
			request.type === "IntentRequest" &&
			request.intent.name === "AMAZON.NextIntent"
		);
	},
	async handle(handlerInput) {
		const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
		const offset = AudioPlayer.offsetInMilliseconds;
		const token = getGithubToken(handlerInput);
		let i = searchPodcast(AudioPlayer, podcasts);
		const next = Number(i) + 1;
		const podcast = podcasts[next];
		// Sauvegarde de l'offset actuel
		podcasts[i].offset = offset;
		podcasts[i].lastopen = handlerInput.requestEnvelope.request.timestamp;
		UpdatePodcasts(podcasts, gist.url, token);

		// Bascule sur le nouveau podcastsconst podcast = podcasts[i]
		if (podcast !== undefined) {
			return handlerInput.responseBuilder
				.speak(`Titre ${next + 1} : ${podcast.name}`)
				.addAudioPlayerPlayDirective(
					"REPLACE_ALL",
					podcast.url,
					podcast.id ? podcast.id : podcast.url,
					podcast.offset - 500,
					null,
					setAudioMetadata(podcasts[i])
				)
				.withSimpleCard(
					podcast.name,
					podcast.synopsis ? podcast.synopsis : ""
				)
				.getResponse();
		} else {
			return handlerInput.responseBuilder
				.speak("Fin des podcasts bonne nuit et à demain!")
				.withSimpleCard("Fin des podcast bonne nuit!", "A demain!")
				.withShouldEndSession(true)
				.getResponse();
		}
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent PreviousPlaybackIntent : play previous podcast of the podcasts list
// ----------------------------------------------------------------------------------------------------------------
const PreviousPlaybackHandler = {
	canHandle(handlerInput) {
		const request = handlerInput.requestEnvelope.request;

		return (
			request.type === "IntentRequest" &&
			request.intent.name === "AMAZON.PreviousIntent"
		);
	},
	async handle(handlerInput) {
		const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
		const offset = AudioPlayer.offsetInMilliseconds;
		const token = getGithubToken(handlerInput);
		let i = searchPodcast(AudioPlayer, podcasts);
		const prev = Number(i) - 1;
		const podcast = podcasts[prev];
		// Sauvegarde de l'offset actuel
		podcasts[i].offset = offset;
		podcasts[i].lastopen = handlerInput.requestEnvelope.request.timestamp;
		UpdatePodcasts(podcasts, gist.url, token);
		// Bascule sur le nouveau podcastsconst podcast = podcasts[i]
		if (podcast !== undefined) {
			return handlerInput.responseBuilder
				.speak(
					`Titre ${prev + 1} : ${
						podcast.name ? podcast.name : "Sans Titre"
					}`
				)
				.addAudioPlayerPlayDirective(
					"REPLACE_ALL",
					podcast.url,
					podcast.id ? podcast.id : podcast.url,
					podcast.offset - 500,
					null,
					setAudioMetadata(podcasts[i])
				)
				.withSimpleCard(
					podcast.name ? podcast.name : "Sans Titre",
					podcast.synopsis ? podcast.synopsis : ""
				)
				.getResponse();
		} else {
			return handlerInput.responseBuilder
				.speak(
					`Vous êtes en début de Liste! Il n'y a pas de morceau précédent!`
				)
				.getResponse();
		}
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent ForwardIntent : playing forward with delay in s
// ----------------------------------------------------------------------------------------------------------------
const ForwardHandler = {
	canHandle(handlerInput) {
		const request = handlerInput.requestEnvelope.request;

		return (
			request.type === "IntentRequest" &&
			request.intent.name === "ForwardIntent"
		);
	},
	async handle(handlerInput) {
		const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
		const offset = AudioPlayer.offsetInMilliseconds;
		const podcast = getPodcast(AudioPlayer, podcasts);
		const delay = Number(
			handlerInput.requestEnvelope.request.intent.slots.Delay_up.value
		);
		return handlerInput.responseBuilder
			.speak(`J'avance de ${delay} secondes`) // à supprimer en prod
			.addAudioPlayerPlayDirective(
				"REPLACE_ALL",
				podcast.url,
				podcast.id ? podcast.id : podcast.url,
				offset + delay * 1000,
				null,
				setAudioMetadata(podcast)
			)
			.withSimpleCard(
				podcast.name ? podcast.name : "Sans Titre",
				`>>> ${delay}s >>>`
			)
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent BackwardIntent : playing backward with a delay in s
// ----------------------------------------------------------------------------------------------------------------
const BackwardHandler = {
	canHandle(handlerInput) {
		const request = handlerInput.requestEnvelope.request;

		return (
			request.type === "IntentRequest" &&
			request.intent.name === "BackwardIntent"
		);
	},
	async handle(handlerInput) {
		const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
		const offset = AudioPlayer.offsetInMilliseconds;
		const podcast = getPodcast(AudioPlayer, podcasts);
		const delay = Number(
			handlerInput.requestEnvelope.request.intent.slots.Delay_down.value
		);
		return handlerInput.responseBuilder
			.speak(`Je recule de ${delay} secondes`) // à supprimer en prod
			.addAudioPlayerPlayDirective(
				"REPLACE_ALL",
				podcast.url,
				podcast.id ? podcast.id : podcast.url,
				offset - delay * 1000,
				null,
				setAudioMetadata(podcast)
			)
			.withSimpleCard(
				podcast.name ? podcast.name : "Sans Titre",
				`<<< ${delay}s <<<`
			)
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// AudioPlayerEventHandler : handling AudioPlayer actions
// ----------------------------------------------------------------------------------------------------------------
const AudioPlayerEventHandler = {
	canHandle(handlerInput) {
		const request = handlerInput.requestEnvelope.request;

		return (
			request.type === "AudioPlayer.PlaybackStarted" ||
			request.type === "AudioPlayer.PlaybackStopped" ||
			request.type === "PlaybackController.PlayCommandIssued" ||
			request.type === "PlaybackController.NextCommandIssued" ||
			request.type === "PlaybackController.PreviousCommandIssued" ||
			request.type === "AudioPlayer.PlaybackNearlyFinished" ||
			request.type === "AudioPlayer.PlaybackFinished" ||
			request.type === "AudioPlayer.PlaybackFailed"
		);
	},
	async handle(handlerInput) {
		const request = handlerInput.requestEnvelope.request;
		const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
		const offset = AudioPlayer.offsetInMilliseconds;
		let i = searchPodcast(AudioPlayer, podcasts);
		const token = getGithubToken(handlerInput);
		const next = Number(i) + 1;
		const prev = Number(i) - 1;
		const current = Number(i);
		switch (request.type) {
			case "AudioPlayer.PlaybackStarted":
				return handlerInput.responseBuilder.getResponse();

			case "PlaybackController.PlayCommandIssued":
				return handlerInput.responseBuilder
					.addAudioPlayerPlayDirective(
						"REPLACE_ALL",
						podcasts[current].url,
						podcasts[current].id
							? podcasts[current].id
							: podcasts[current].url,
						offset,
						null
					)
					.getResponse();

			case "PlaybackController.NextCommandIssued":
				return handlerInput.responseBuilder
					.addAudioPlayerPlayDirective(
						"REPLACE_ALL",
						podcasts[next].url,
						podcasts[next].id
							? podcasts[next].id
							: podcasts[next].url,
						podcasts[next].offset,
						null,
						setAudioMetadata(podcasts[next])
					)
					.getResponse();

			case "PlaybackController.PreviousCommandIssued":
				return handlerInput.responseBuilder
					.addAudioPlayerPlayDirective(
						"REPLACE_ALL",
						podcasts[prev].url,
						podcasts[prev].id
							? podcasts[prev].id
							: podcasts[prev].url,
						podcasts[prev].offset,
						null,
						setAudioMetadata(podcasts[prev])
					)
					.getResponse();

			case "AudioPlayer.PlaybackFinished":
				podcasts[current].state = "read";
				UpdatePodcasts(podcasts, gist.url, token);
				return handlerInput.responseBuilder.getResponse();

			case "AudioPlayer.PlaybackStopped":
				return handlerInput.responseBuilder.getResponse();

			case "AudioPlayer.PlaybackNearlyFinished":
				return handlerInput.responseBuilder
					.addAudioPlayerPlayDirective(
						"REPLACE_ENQUEUED",
						podcasts[next].url,
						podcasts[next].id
							? podcasts[next].id
							: podcasts[next].url,
						podcasts[next].offset,
						null,
						setAudioMetadata(podcasts[next])
					)
					.getResponse();

			case "AudioPlayer.PlaybackFailed":
				break;
		}

		return handlerInput.responseBuilder.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// ErrorHandler : Handling error send console log and speak error message
// ----------------------------------------------------------------------------------------------------------------
const ErrorHandler = {
	canHandle() {
		return true;
	},
	handle(handlerInput, error) {
		Logger.error(
			"An error was handled during skill process, trace :",
			error
		);

		return handlerInput.responseBuilder
			.speak(`Oh non ! La skill a eu un problème. Réessayer plus tard !`)
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// HelpHandler : Handling help : send instruction message
// ----------------------------------------------------------------------------------------------------------------
const HelpHandler = {
	canHandle(handlerInput) {
		const request = handlerInput.requestEnvelope.request;

		return (
			request.type === "IntentRequest" &&
			request.intent.name === "AMAZON.HelpIntent"
		);
	},
	async handle(handlerInput) {
		return handlerInput.responseBuilder
			.speak(
				`Vous pouvez jouer le podcast de votre choix de la liste de vos podcasts préalablement téléchargé via le site web. ` +
					`Pour cela, dites Alexa joue le titre, suivi du numéro de podcast dans l'ordre de votre liste. ` +
					`Vous pouvez mettre en pause un podcast en cours de lecture. Pour cela dites pause ou stop. ` +
					`Il vous suffira de dire simplement : Alexa reprend,  pour reprendre la lecture du dernier podcast en pause. ` +
					`Vous pouvez avancer de quelques secondes en avant ou en arrière. ` +
					`Pour cela, vous pouvez dire : Alexa avance de 30, pour avancer de 30 secondes la lecture du podcast, ou bien Alexa recule de 40, pour reculer la lecture de 40 secondes. ` +
					`Vous pouvez dire : Alexa suivant, pour passer au podcast suivant, ou bien : Alexa précédent pour jouer le podcast précédent. ` +
					`Enfin vous pouvez demander le synopsis du podcast en disant simplement Alexa résumé ou Alexa synopsis.`
			)
			.withSimpleCard("MyPodcast", `Aide : `)
			.reprompt(`Que voulez vous faire ?`)
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// LastHandler : Say the last Podcast played
// ----------------------------------------------------------------------------------------------------------------
const LastHandler = {
	canHandle(handlerInput) {
		const request = handlerInput.requestEnvelope.request;

		return (
			request.intent.name === "AMAZON.YesIntent" ||
			(request.type === "IntentRequest" &&
				request.intent.name === "LastIntent")
		);
	},
	async handle(handlerInput) {
		const i = Number(searchLastPodcast(podcasts));
		return handlerInput.responseBuilder
			.speak(
				`Ok je reprend le dernier podcast joué. Titre ${i + 1} : ${
					podcasts[i].name ? podcasts[i].name : "Sans Titre"
				}`
			)
			.addAudioPlayerPlayDirective(
				"REPLACE_ALL",
				podcasts[i].url,
				podcasts[i].id ? podcasts[i].id : podcasts[i].url,
				podcasts[i].offset,
				null,
				setAudioMetadata(podcasts[i])
			)
			.withSimpleCard(
				podcasts[i].name ? podcasts[i].name : "Sans Titre",
				podcasts[i].synopsis ? podcasts[i].synopsis : ""
			)
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent ListHandler : give the podcasts list
// ----------------------------------------------------------------------------------------------------------------
const ListHandler = {
	canHandle(handlerInput) {
		const request = handlerInput.requestEnvelope.request;

		return (
			request.type === "IntentRequest" &&
			request.intent.name === "ListIntent"
		);
	},
	async handle(handlerInput) {
		let podcastsNames = getNames();
		return handlerInput.responseBuilder
			.speak(
				`Voici la liste des ${podcastsNames.number} podcasts disponibles : ${podcastsNames.names}. Quel titre voulez vous jouer ?`
			)
			.reprompt(`Quel morceau voulez vous jouer ?`)
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent StartAtOffsetHandler : playing forward with delay in s
// ----------------------------------------------------------------------------------------------------------------
const StartAtOffsetHandler = {
	canHandle(handlerInput) {
		const request = handlerInput.requestEnvelope.request;

		return (
			request.type === "IntentRequest" &&
			request.intent.name === "StartAtOffsetIntent"
		);
	},
	async handle(handlerInput) {
		const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
		const podcast = getPodcast(AudioPlayer, podcasts);
		const offset = Number(
			handlerInput.requestEnvelope.request.intent.slots.Offset.value
		);
		return handlerInput.responseBuilder
			.speak(`ok je commence à partir de ${offset} secondes`) // à supprimer en prod
			.addAudioPlayerPlayDirective(
				"REPLACE_ALL",
				podcast.url,
				podcast.id ? podcast.id : podcast.url,
				offset * 1000,
				null,
				setAudioMetadata(podcast)
			)
			.withSimpleCard(
				podcast.name ? podcast.name : "Sans Titre",
				`Lecture à ${offset}s >>>`
			)
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// CheckAccountLinkedHandler : Check if the git account needed for storing the podcasts list in a gist is linked
// ----------------------------------------------------------------------------------------------------------------
const CheckAccountLinkedHandler = {
	canHandle(handlerInput) {
		Logger.info("Cheking if account is correctly linked");
		return isAccountLinked(handlerInput);
	},
	handle(handlerInput) {
		Logger.warn("Account isn't correctly linked");
		const speakOutput = `My Podcast nécéssite la connexion a votre compte github, j'envoie les informations de connexion sur votre application Alexa.`;
		return handlerInput.responseBuilder
			.speak(speakOutput)
			.withLinkAccountCard()
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// LogResponseInterceptor - For debug purpose permit to log request and repsonse
// ----------------------------------------------------------------------------------------------------------------
const LogResponseInterceptor = {
	process(handlerInput, response) {
		const request = handlerInput.requestEnvelope.request;
		let logLevel = Logger.getLevel();
		switch (logLevel) {
			case Logger.INFO:
				Logger.debug(
					`Requesting [${request.type}]${
						request.intent
							? request.intent.name
								? ` - [${request.intent.name}] `
								: ""
							: ""
					}`
				);

			case Logger.DEBUG:
				Logger.debug(
					`Requesting [${request.type}]${
						request.intent
							? request.intent.name
								? ` - [${request.intent.name}] `
								: ""
							: ""
					}\n`,
					request
				);
				Logger.debug(`Response :\n`, response);
				break;

			default:
				break;
		}
	},
};

// ----------------------------------------------------------------------------------------------------------------
// CheckGist : Check if the gits is created or not
// ----------------------------------------------------------------------------------------------------------------
const CheckGist = {
	async canHandle(handlerInput) {
		Logger.info("Getting gist");
		gist = await getGist(getGithubToken(handlerInput));
		return gist ? false : true;
	},
	handle(handlerInput) {
		Logger.warn("No gist found");
		const speakOutput = `My Podcast nécéssite la création d'une liste de podcast pour cela ouvrez l'application web mypodcast vercel`;
		return handlerInput.responseBuilder.speak(speakOutput).getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// CheckPodcasts: Check if there is at least one podcast in the list
// ----------------------------------------------------------------------------------------------------------------
const CheckPodcasts = {
	async canHandle(handlerInput) {
		Logger.info("Getting podcasts");
		podcasts = await getPodcasts(gist.raw_url);
		return podcasts.length ? false : true;
	},
	handle(handlerInput) {
		Logger.warn("No podcasts founds");
		const speakOutput = `My Podcast nécéssite au moins un podcast pour fonctionner, pour cela ouvrez l'application web mypodcast vercel`;
		return handlerInput.responseBuilder.speak(speakOutput).getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// CheckAccountPermissionHandler : Check if permissions on first name reading are autorised on alexa app
// ----------------------------------------------------------------------------------------------------------------
const CheckAccountPermissionHandler = {
	canHandle(handlerInput) {
		Logger.info("Checking Account permission");
		// If we can update Username, we have PERMISSIONS instead we request PERMISSIONS.
		return isPermission(handlerInput);
	},
	handle(handlerInput) {
		Logger.info("User doesn't gave permission");
		const PERMISSIONS = ["alexa::profile:given_name:read"];
		const speakOutput =
			"My Podcast nécéssite l'accès a certaines de vos informations personnelles comme votre prénom, j'envoie la procédure d'autorisation nécéssaires sur votre application Alexa.";
		return handlerInput.responseBuilder
			.speak(speakOutput)
			.withAskForPermissionsConsentCard(PERMISSIONS)
			.getResponse();
	},
};

// ****************************************************************************************************************
// FUNCTIONS
// ****************************************************************************************************************

// ----------------------------------------------------------------------------------------------------------------
// getNames() : return the number and the names of podcasts list
// ----------------------------------------------------------------------------------------------------------------
function getNames() {
	let names = "";
	let state = "";
	let number = 0;
	podcasts.map((podcast) => {
		number++;
		if (podcast.state === "read") {
			state = "déjà lu";
		} else if (podcast.state === "in_read") {
			state = "en cours de lecture";
		} else {
			state = "nouveau";
		}
		names += `${number} : ${state}, ${
			podcast.name ? podcast.name : "Sans Titre"
		} <break time="1s"/>`;
	});
	return { names, number };
}

// ----------------------------------------------------------------------------------------------------------------
// setAudioMetadata(podcast) : return the AudioMetadata of the played podcast
// ----------------------------------------------------------------------------------------------------------------
function setAudioMetadata(podcast) {
	let AudioItemMetadata = {};
	podcast.name
		? (AudioItemMetadata.title = podcast.name)
		: (AudioItemMetadata.title = "Sans Titre");
	var audioimageEnclosure = {
		sources: [
			{
				url: podcast.img
					? podcast.img
					: "https://images-na.ssl-images-amazon.com/images/I/71vCwOUSqRL._SL210_.png",
			},
		],
	};
	AudioItemMetadata.art = audioimageEnclosure;
	Logger.log(AudioItemMetadata);
	return AudioItemMetadata;
}

// ----------------------------------------------------------------------------------------------------------------
// getPodcast(AudioPlayer, podcasts) : return the podcast object played actually by the Audioplayer
// ----------------------------------------------------------------------------------------------------------------
function getPodcast(AudioPlayer, podcasts) {
	for (let i in podcasts) {
		if (AudioPlayer.token === podcasts[i].id) {
			return podcasts[i];
		}
	}
}

// ----------------------------------------------------------------------------------------------------------------
// searchPodcast(AudioPlayer,podcasts) : return the podcast number played actually by the Audioplayer
// ----------------------------------------------------------------------------------------------------------------
function searchPodcast(AudioPlayer, podcasts) {
	for (let i in podcasts) {
		if (AudioPlayer.token === podcasts[i].id) {
			return i;
		}
	}
}

// ----------------------------------------------------------------------------------------------------------------
// searchLastPodcast(AudioPlayer,podcasts) : return the Last podcast played
// ----------------------------------------------------------------------------------------------------------------
function searchLastPodcast(podcasts) {
	var baseTime = new Date("2021-01-01T00:00:00").valueOf();
	var timestamp;
	let j = null;
	for (let i in podcasts) {
		if (podcasts[i].lastopen) {
			timestamp = new Date(podcasts[i].lastopen).valueOf();
			console.log("Podcast ", i, " time : ", timestamp);
			if (timestamp > baseTime) {
				baseTime = timestamp;
				j = i;
			}
		}
	}
	return j;
}

// ----------------------------------------------------------------------------------------------------------------
// getPodcasts(url) : return the podcasts list objet
// ----------------------------------------------------------------------------------------------------------------
async function getPodcasts(url) {
	let response = await axios.get(url);
	return response.data;
}

// ----------------------------------------------------------------------------------------------------------------
// getGist(token) : return the gist id and the raw_url hosting podcasts list
// ----------------------------------------------------------------------------------------------------------------
async function getGist(token) {
	let gists = await axios.get("https://api.github.com/gists", {
		params: {
			per_page: 5,
		},
		headers: {
			Authorization: `token ${token}`,
			"User-Agent": "Alexa-App",
		},
	});
	gists = gists.data;
	for (let i in gists) {
		if (gists[i].description === "MyPodcast") {
			return {
				id: gists[i].id,
				url: gists[i].url,
				raw_url: gists[i].files["podcasts.json"].raw_url,
			};
		}
	}
}

// ----------------------------------------------------------------------------------------------------------------
// UpdatePodcasts(podcasts) : update the podcasts list with a gist.raw_url and the gist token
// ----------------------------------------------------------------------------------------------------------------
async function UpdatePodcasts(podcasts, raw_url, token) {
	await axios({
		method: "post",
		url: raw_url,
		data: {
			files: {
				"podcasts.json": {
					content: `${JSON.stringify(podcasts)}`,
				},
			},
		},
		headers: {
			Authorization: `token ${token}`,
			"User-Agent": "Alexa-App",
		},
	})
		.then(function (reponse) {
			Logger.info("sucessfully updated podcasts");
		})
		.catch(function (error) {
			Logger.error("Error while updating podcasts, error :", error);
		});
}

// ----------------------------------------------------------------------------------------------------------------
// getGithubToken(handlerInput) : return Github token
// ----------------------------------------------------------------------------------------------------------------
function getGithubToken(handlerInput) {
	return handlerInput.requestEnvelope.context.System.user.accessToken;
}

// ----------------------------------------------------------------------------------------------------------------
// isAccountLinked(handlerInput) : return boolean if Github account is linked or not
// ----------------------------------------------------------------------------------------------------------------
function isAccountLinked(handlerInput) {
	// if there is an access token, then assumed linked
	return getGithubToken(handlerInput) === undefined;
}

// ----------------------------------------------------------------------------------------------------------------
// isPermission(handlerInput): return boolean if permission to get profile given name is given or not
// ----------------------------------------------------------------------------------------------------------------
async function isPermission(handlerInput) {
	const { responseBuilder, serviceClientFactory } = handlerInput;
	try {
		const upsServiceClient = serviceClientFactory.getUpsServiceClient();
		username = await upsServiceClient.getProfileGivenName();

		// Update logger and set a prefix with the username
		let usernameHandler = Logger.createDefaultHandler({
			formatter: function (messages, context) {
				messages.unshift(`[${username ? username : "NoUsername"}]`);
			},
		});
		Logger.setHandler(function (messages, context) {
			usernameHandler(messages, context);
		});

		return false;
	} catch (error) {
		Logger.warn("Insufficient permission, requesting permission");
		return true;
	}
}

// ****************************************************************************************************************
// Skill Builders
// ****************************************************************************************************************
exports.handler = Alexa.SkillBuilders.custom()
	.addRequestHandlers(
		CheckAccountPermissionHandler,
		CheckAccountLinkedHandler,
		CheckGist,
		CheckPodcasts,
		AudioPlayerEventHandler,
		LaunchRequestHandler,
		RestartSoundHandler,
		ExitHandler,
		SessionEndedRequestHandler,
		PausePlaybackHandler,
		ResumePlaybackHandler,
		NextPlaybackHandler,
		PreviousPlaybackHandler,
		ForwardHandler,
		BackwardHandler,
		SynopsisHandler,
		HelpHandler,
		LastHandler,
		ListHandler,
		StartAtOffsetHandler,
		TitleHandler,
		NoHandler
	)
	.addResponseInterceptors(LogResponseInterceptor)
	.addErrorHandlers(ErrorHandler)
	.withApiClient(new Alexa.DefaultApiClient())
	.lambda();
