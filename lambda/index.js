/* **
 * ****************************************************************************************************************
 * Skill : MyPodcast
 * Version : 1.4.0
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
	handle(handlerInput) {
		var heure = new Date();
		heure = heure.getHours();
		let hello;
		heure > "19" ? (hello = "Bonsoir") : (hello = "Bonjour");
		return handlerInput.responseBuilder
			.speak(
				`${hello} ${username}, voulez vous reprendre la dernière lecture ?`
			)
			.reprompt(`Voulez vous reprendre là ou vous en étiez?`)
			.getResponse();
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
			names += `${number} : ${state}, ${podcast.name} <break time="1s"/>`;
		});
		return handlerInput.responseBuilder
			.speak(
				`OK, voici les ${number} podcasts de ce soir : ${names}. Quel numéro de titre voulez vous jouer ?`
			)
			.reprompt(`Quel morceau voulez vous jouer ?`)
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent LaunchRequest : Start playing podcast
// ----------------------------------------------------------------------------------------------------------------
const StartSoundHandler = {
	canHandle(handlerInput) {
		return (
			handlerInput.requestEnvelope.request.type === "IntentRequest" &&
			handlerInput.requestEnvelope.request.intent.name ===
				"StartSoundIntent"
		);
	},
	async handle(handlerInput) {
		const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
		const offset = AudioPlayer.offsetInMilliseconds;
		const podcast = getPodcast(AudioPlayer, podcasts);
		return handlerInput.responseBuilder

			.addAudioPlayerPlayDirective(
				"REPLACE_ALL",
				podcast.url,
				podcast.id,
				offset,
				null
			)
			.withSimpleCard(podcast.name, "reprise de la lecture")
			.getResponse();
	},
};

// ----------------------------------------------------------------------------------------------------------------
// Intent Restart : restart from begining the played podcast
// ----------------------------------------------------------------------------------------------------------------
const RestartSoundHandler = {
	canHandle(handlerInput) {
		return (
			(handlerInput.requestEnvelope.request.type === "IntentRequest" &&
				handlerInput.requestEnvelope.request.intent.name ===
					"RestartIntent") ||
			handlerInput.requestEnvelope.request.intent.name ===
				"AMAZON.NavigateHomeIntent" ||
			handlerInput.requestEnvelope.request.intent.name ===
				"AMAZON.StartOverIntent"
		);
	},

	async handle(handlerInput) {
		const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
		const i = searchPodcast(AudioPlayer, podcasts);
		let AudioItemMetadata = {};
		AudioItemMetadata.title = podcasts[i].title;
		var audioimageEnclosure = {
			sources: [
				{
					url: podcasts[i].img,
				},
			],
		};
		AudioItemMetadata.art = audioimageEnclosure;
		return handlerInput.responseBuilder
			.speak(`Je reprends au début : ${podcasts[i].name}`)
			.addAudioPlayerPlayDirective(
				"REPLACE_ALL",
				podcasts[i].url,
				podcasts[i].id,
				0,
				null,
				AudioItemMetadata
			)
			.withSimpleCard(podcasts[i].name, podcasts[i].synopsis)
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
			let AudioItemMetadata = {};
			AudioItemMetadata.title = podcasts[podcastnumber].title;
			var audioimageEnclosure = {
				sources: [
					{
						url: podcasts[podcastnumber].img,
					},
				],
			};
			AudioItemMetadata.art = audioimageEnclosure;
			return handlerInput.responseBuilder
				.speak(
					`OK je ${state} le titre ${
						podcastnumber + 1
					} <break time="1s"/> ${podcasts[podcastnumber].name}`
				)
				.addAudioPlayerPlayDirective(
					"REPLACE_ALL",
					podcasts[podcastnumber].url,
					podcasts[podcastnumber].id,
					podcasts[podcastnumber].offset,
					null,
					AudioItemMetadata
				)
				.withSimpleCard(
					podcasts[podcastnumber].name,
					podcasts[podcastnumber].synopsis
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
				`Le synopsis du titre ${podcastnumber + 1} ${
					podcasts[podcastnumber].name
				} est ${podcasts[podcastnumber].synopsis}`
			)
			.withSimpleCard(
				podcasts[podcastnumber].name,
				podcasts[podcastnumber].synopsis
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
		const podcast = podcasts[i];
		podcasts[i].offset = offset;
		podcasts[i].state = "in_read";
		podcasts[i].lastopen = handlerInput.requestEnvelope.request.timestamp;
		UpdatePodcasts(podcasts, gist.url, token);
		return handlerInput.responseBuilder
			.addAudioPlayerStopDirective()
			.speak(`Lecture en pause`) // à supprimer en prod
			.withSimpleCard(podcast.name, "Pause")
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
				podcast.id,
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
		let AudioItemMetadata = {};
		AudioItemMetadata.title = podcasts[next].title;
		var audioimageEnclosure = {
			sources: [
				{
					url: podcasts[next].img,
				},
			],
		};
		AudioItemMetadata.art = audioimageEnclosure;
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
					podcast.id,
					podcast.offset - 500,
					null,
					AudioItemMetadata
				)
				.withSimpleCard(podcast.name, podcast.synopsis)
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
		let AudioItemMetadata = {};
		AudioItemMetadata.title = podcasts[prev].title;
		var audioimageEnclosure = {
			sources: [
				{
					url: podcasts[prev].img,
				},
			],
		};
		AudioItemMetadata.art = audioimageEnclosure;
		// Sauvegarde de l'offset actuel
		podcasts[i].offset = offset;
		podcasts[i].lastopen = handlerInput.requestEnvelope.request.timestamp;
		UpdatePodcasts(podcasts, gist.url, token);
		// Bascule sur le nouveau podcastsconst podcast = podcasts[i]
		if (podcast !== undefined) {
			return handlerInput.responseBuilder
				.speak(`Titre ${prev + 1} : ${podcast.name}`)
				.addAudioPlayerPlayDirective(
					"REPLACE_ALL",
					podcast.url,
					podcast.id,
					podcast.offset - 500,
					null,
					AudioItemMetadata
				)
				.withSimpleCard(podcast.name, podcast.synopsis)
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
		let AudioItemMetadata = {};
		AudioItemMetadata.title = podcast.title;
		var audioimageEnclosure = {
			sources: [
				{
					url: podcast.img,
				},
			],
		};
		AudioItemMetadata.art = audioimageEnclosure;
		const delay = Number(
			handlerInput.requestEnvelope.request.intent.slots.Delay_up.value
		);
		return handlerInput.responseBuilder
			.speak(`J'avance de ${delay} secondes`) // à supprimer en prod
			.addAudioPlayerPlayDirective(
				"REPLACE_ALL",
				podcast.url,
				podcast.id,
				offset + delay * 1000,
				null,
				AudioItemMetadata
			)
			.withSimpleCard(podcast.name, `>>> ${delay}s >>>`)
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
		let AudioItemMetadata = {};
		AudioItemMetadata.title = podcast.title;
		var audioimageEnclosure = {
			sources: [
				{
					url: podcast.img,
				},
			],
		};
		AudioItemMetadata.art = audioimageEnclosure;
		const delay = Number(
			handlerInput.requestEnvelope.request.intent.slots.Delay_down.value
		);
		return handlerInput.responseBuilder
			.speak(`Je recule de ${delay} secondes`) // à supprimer en prod
			.addAudioPlayerPlayDirective(
				"REPLACE_ALL",
				podcast.url,
				podcast.id,
				offset - delay * 1000,
				null,
				AudioItemMetadata
			)
			.withSimpleCard(podcast.name, `<<< ${delay}s <<<`)
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
		const next = Number(i) + 1;
		const prev = Number(i) - 1;
		const current = Number(i);
		let AudioItemMetadata = {};
		var audioimageEnclousre = {};
		switch (request.type) {
			case "AudioPlayer.PlaybackStarted":
				return handlerInput.responseBuilder.getResponse();

			case "PlaybackController.PlayCommandIssued":
				return handlerInput.responseBuilder
					.addAudioPlayerPlayDirective(
						"REPLACE_ALL",
						podcasts[current].url,
						podcasts[current].id,
						offset,
						null
					)
					.getResponse();

			case "PlaybackController.NextCommandIssued":
				AudioItemMetadata.title = podcasts[next].title;
				audioimageEnclousre = {
					sources: [
						{
							url: podcasts[next].img,
						},
					],
				};
				AudioItemMetadata.art = audioimageEnclousre;
				AudioItemMetadata.subtitle = podcasts[next].synopsis;
				return handlerInput.responseBuilder
					.addAudioPlayerPlayDirective(
						"REPLACE_ALL",
						podcasts[next].url,
						podcasts[next].id,
						podcasts[next].offset,
						null,
						AudioItemMetadata
					)
					.getResponse();

			case "PlaybackController.PreviousCommandIssued":
				AudioItemMetadata.title = podcasts[prev].title;
				audioimageEnclousre = {
					sources: [
						{
							url: podcasts[prev].img,
						},
					],
				};
				AudioItemMetadata.art = audioimageEnclousre;
				AudioItemMetadata.subtitle = podcasts[prev].synopsis;
				return handlerInput.responseBuilder
					.addAudioPlayerPlayDirective(
						"REPLACE_ALL",
						podcasts[prev].url,
						podcasts[prev].id,
						podcasts[prev].offset,
						null,
						AudioItemMetadata
					)
					.getResponse();

			case "AudioPlayer.PlaybackFinished":
				return handlerInput.responseBuilder.getResponse();

			case "AudioPlayer.PlaybackStopped":
				return handlerInput.responseBuilder.getResponse();

			case "AudioPlayer.PlaybackNearlyFinished":
				AudioItemMetadata.title = podcasts[next].title;
				audioimageEnclousre = {
					sources: [
						{
							url: podcasts[next].img,
						},
					],
				};
				AudioItemMetadata.art = audioimageEnclousre;
				AudioItemMetadata.subtitle = podcasts[next].synopsis;

				return handlerInput.responseBuilder
					.addAudioPlayerPlayDirective(
						"REPLACE_ENQUEUED",
						podcasts[next].url,
						podcasts[next].id,
						podcasts[next].offset,
						null,
						AudioItemMetadata
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
		let AudioItemMetadata = {};
		AudioItemMetadata.title = podcasts[i].title;
		var audioimageEnclosure = {
			sources: [
				{
					url: podcasts[i].img,
				},
			],
		};
		AudioItemMetadata.art = audioimageEnclosure;
		return handlerInput.responseBuilder
			.speak(
				`Ok je reprend le dernier podcast joué. Titre ${i + 1} : ${
					podcasts[i].name
				}`
			)
			.addAudioPlayerPlayDirective(
				"REPLACE_ALL",
				podcasts[i].url,
				podcasts[i].id,
				podcasts[i].offset,
				null,
				AudioItemMetadata
			)
			.withSimpleCard(podcasts[i].name, podcasts[i].synopsis)
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
		var gist = await getGist(getGithubToken(handlerInput));
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
			names += `${number} : ${state}, ${podcast.name} <break time="1s"/>`;
		});
		return handlerInput.responseBuilder
			.speak(
				`Voici la liste des ${number} podcasts disponibles : ${names}. Quel titre voulez vous jouer ?`
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
		var gist = await getGist(getGithubToken(handlerInput));
		const podcast = getPodcast(AudioPlayer, podcasts);
		const offset = Number(
			handlerInput.requestEnvelope.request.intent.slots.Offset.value
		);
		return handlerInput.responseBuilder
			.speak(`ok je commence à partir de ${offset} secondes`) // à supprimer en prod
			.addAudioPlayerPlayDirective(
				"REPLACE_ALL",
				podcast.url,
				podcast.id,
				offset * 1000,
				null
			)
			.withSimpleCard(podcast.name, `Lecture à ${offset}s >>>`)
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
	let j = "";
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
		StartSoundHandler,
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
