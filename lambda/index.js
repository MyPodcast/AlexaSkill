/* *
 * ****************************************************************************************************************
 * Skill : MyPodcast
 * Version : 1.1.0
 * Authors : Evann DREUMONT
 *              backend : Github gist hosting podcast url, gist link and auto recovery with account linking
 *                        web site for editing, updating podcasts list & 
 *           Benjamin DREUMONT 
 *              frontend : Alexa's build skill, Intent, Audioplayer Handling
 * ----------------------------------------------------------------------------------------------------------------
 * Updates :
 * ****************************************************************************************************************
 * */

// ****************************************************************************************************************
// LIBRARY AND CONSTANTS
// ****************************************************************************************************************
const axios = require("axios");
const Alexa = require('ask-sdk-core');

// ----------------------------------------------------------------------------------------------------------------
// Test Constants to delete after
// ----------------------------------------------------------------------------------------------------------------
var username = '';
var gist = null;
var podcasts = null;

//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// TODO LIST :
// + Voir les à revoir :) OK
// + Mettre à jour le statuts du podcats : read, not_read ou in_reading et personnaliser le message alexa voir ancien LaunchRequestHandler OK
// + Mettre in time stamp dans le last Open des podcast et 
// + Message alexa à l'ouverture Le dernier podcats joué à partir du timestamp!... searchLastPodcast(podcasts) demander le dernier podcast joué?
// + Faire le a propos : renvoyer le synopsis du titre demandé OK
// + Faire une aide OK
// - Faire une fonction regroupant l'ensemble des requete pour les différents type genre StartPodcast et StopPodcast
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

// ****************************************************************************************************************
// INTENTS MANAGE
// ****************************************************************************************************************

// ----------------------------------------------------------------------------------------------------------------
// Intent LaunchRequest : play the first podcast of the podcasts list
// ---------------------------------------------------------------------------------------------------------------- 
const LaunchRequestHandler = {

    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    async handle(handlerInput) {
        let names = "";
        let state = "";
        let number = 0;
        podcasts.map(podcast => {
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
            .speak(`Bonsoir ${username}, voici les ${number} podcasts de ce soir : ${names}. Quel numéro de titre voulez vous jouer ?`)
            .reprompt(`Quel morceau voulez vous jouer ?`)
            .getResponse();
    }
};

// ----------------------------------------------------------------------------------------------------------------
// Intent LaunchRequest : Start playing podcast
// ---------------------------------------------------------------------------------------------------------------- 
const StartSoundHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'StartSoundIntent';
    },
    async handle(handlerInput) {
        const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
        const offset = AudioPlayer.offsetInMilliseconds;
        const podcast = getPodcast(AudioPlayer, podcasts);
        return handlerInput.responseBuilder

            .addAudioPlayerPlayDirective('REPLACE_ALL', podcast.url, podcast.id, offset, null)
            .withSimpleCard(podcast.name, 'reprise de la lecture')
            .getResponse();
    },
};


// ----------------------------------------------------------------------------------------------------------------
// Intent Restart : restart from begining the played podcast
// ---------------------------------------------------------------------------------------------------------------- 
const RestartSoundHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'RestartIntent' ||
            handlerInput.requestEnvelope.request.intent.name === 'AMAZON.NavigateHomeIntent' ||
            handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StartOverIntent';
    },

    async handle(handlerInput) {
        const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
        const i = searchPodcast(AudioPlayer, podcasts)
        const podcast = podcasts[i]
        console.log(podcast)
        return handlerInput.responseBuilder
            .speak(`Je reprends au début : ${podcast.name}`)
            .addAudioPlayerPlayDirective('REPLACE_ALL', podcast.url, podcast.id, 0, null)
            .withSimpleCard(podcast.name, podcast.synopsis)
            .getResponse();
    }
};

// ----------------------------------------------------------------------------------------------------------------
// Intent TitleIntent : Play the title number of the podcasts list
// ---------------------------------------------------------------------------------------------------------------- 
const TitleHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'TitleIntent';
    },
    async handle(handlerInput) {
        let podcastnumber = handlerInput.requestEnvelope.request.intent.slots.Title.value - 1;
        let state = "";
        if (podcasts[podcastnumber].state === "in_read") {
            state = "reprends";
        } else {
            state = "joue";
        }
        return handlerInput.responseBuilder
            .speak(`OK je ${state} le titre ${podcastnumber+1} <break time="1s"/> ${podcasts[podcastnumber].name}`)
            .addAudioPlayerPlayDirective('REPLACE_ALL', podcasts[podcastnumber].url, podcasts[podcastnumber].id, podcasts[podcastnumber].offset, null)
            .withSimpleCard(podcasts[podcastnumber].name, podcasts[podcastnumber].synopsis)
            .getResponse();
    }
};

// ----------------------------------------------------------------------------------------------------------------
// Intent TitleIntent : Play the title number of the podcasts list
// ---------------------------------------------------------------------------------------------------------------- 
const SynopsisHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'SynopsisIntent';
    },
    async handle(handlerInput) {
        var gist = await getGist(getGithubToken(handlerInput));
        let podcastnumber = handlerInput.requestEnvelope.request.intent.slots.SynTitle.value - 1;
        return handlerInput.responseBuilder
            .speak(`Le synopsis du titre ${podcastnumber+1} ${podcasts[podcastnumber].name} est ${podcasts[podcastnumber].synopsis}`)
            .withSimpleCard(podcasts[podcastnumber].name, podcasts[podcastnumber].synopsis)
            .getResponse();
    }
};

// ----------------------------------------------------------------------------------------------------------------
// Intent Stop/CancelIntent : Stop the skil
// ---------------------------------------------------------------------------------------------------------------- 
const ExitHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' &&
            (request.intent.name === 'AMAZON.StopIntent' ||
                request.intent.name === 'AMAZON.CancelIntent');
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .addAudioPlayerStopDirective()
            .getResponse();
    }
};

// ----------------------------------------------------------------------------------------------------------------
// Intent SessionlIntent : Ending the skill
// ----------------------------------------------------------------------------------------------------------------  
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        //any cleanup logic goes here

        return handlerInput.responseBuilder
            .speak(`Bonne nuit ! à bientôt pour de nouveaux podcasts!`)
            .getResponse();
    }
};

// ----------------------------------------------------------------------------------------------------------------
// Intent PauseIntent : Pause the played podcast
// ---------------------------------------------------------------------------------------------------------------- 
const PausePlaybackHandler = {
    canHandle(handlerInput) {

        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.PauseIntent';
    },
    async handle(handlerInput) {
        const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
        const offset = AudioPlayer.offsetInMilliseconds;
        const token = getGithubToken(handlerInput);
        const i = searchPodcast(AudioPlayer, podcasts)
        const podcast = podcasts[i]
        podcasts[i].offset = offset;
        podcasts[i].state = "in_read";
        podcasts[i].lastopen = handlerInput.requestEnvelope.request.timestamp;
        UpdatePodcasts(podcasts, gist.url, token);
        return handlerInput.responseBuilder
            .addAudioPlayerStopDirective()
            .speak(`Lecture en pause`) // à supprimer en prod
            .withSimpleCard(podcast.name, 'Pause')
            .getResponse();
    },
};

// ----------------------------------------------------------------------------------------------------------------
// Intent ResumePlaybackIntent : resume the last played podcast
// ---------------------------------------------------------------------------------------------------------------- 
const ResumePlaybackHandler = {
    canHandle(handlerInput) {

        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.ResumeIntent';
    },
    async handle(handlerInput) {
        const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
        const offset = AudioPlayer.offsetInMilliseconds;
        const podcast = getPodcast(AudioPlayer, podcasts);
        return handlerInput.responseBuilder
            .speak('La lecture reprend') // à supprimer en prod
            .addAudioPlayerPlayDirective('REPLACE_ALL', podcast.url, podcast.id, offset - 1000, null)
            .withSimpleCard(podcast.name, 'reprise de la lecture')
            .getResponse();
    },
};


// ----------------------------------------------------------------------------------------------------------------
// Intent NextPlaybackIntent : play next podcast of the podcasts list
// ---------------------------------------------------------------------------------------------------------------- 
const NextPlaybackHandler = {
    canHandle(handlerInput) {

        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.NextIntent';
    },
    async handle(handlerInput) {
        const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
        const offset = AudioPlayer.offsetInMilliseconds;
        const token = getGithubToken(handlerInput);
        let i = searchPodcast(AudioPlayer, podcasts)
        const next = Number(i) + 1;
        console.log(next)
        const podcast = podcasts[next]
        console.log(podcast)
            // Sauvegarde de l'offset actuel
        podcasts[i].offset = offset;
        podcasts[i].lastopen = handlerInput.requestEnvelope.request.timestamp;
        UpdatePodcasts(podcasts, gist.url, token);

        // Bascule sur le nouveau podcastsconst podcast = podcasts[i]
        if (podcast !== undefined) {
            return handlerInput.responseBuilder
                .speak(`Titre ${next+1} : ${podcast.name}`)
                .addAudioPlayerPlayDirective('REPLACE_ALL', podcast.url, podcast.id, podcast.offset - 500, null)
                .withSimpleCard(podcast.name, podcast.synopsis)
                .getResponse();
        } else {
            return handlerInput.responseBuilder
                .speak('Fin des podcasts bonne nuit et à demain!')
                .withSimpleCard('Fin des podcast bonne nuit!', 'A demain!')
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

        return request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.PreviousIntent';
    },
    async handle(handlerInput) {
        const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
        const offset = AudioPlayer.offsetInMilliseconds;
        const token = getGithubToken(handlerInput)
        let i = searchPodcast(AudioPlayer, podcasts)
        const prev = Number(i) - 1;
        const podcast = podcasts[prev]
        console.log(podcast)
            // Sauvegarde de l'offset actuel
        podcasts[i].offset = offset;
        podcasts[i].lastopen = handlerInput.requestEnvelope.request.timestamp;
        UpdatePodcasts(podcasts, gist.url, token);
        // Bascule sur le nouveau podcastsconst podcast = podcasts[i]
        if (podcast !== undefined) {
            return handlerInput.responseBuilder
                .speak(`Titre ${prev+1} : ${podcast.name}`)
                .addAudioPlayerPlayDirective('REPLACE_ALL', podcast.url, podcast.id, podcast.offset - 500, null)
                .withSimpleCard(podcast.name, podcast.synopsis)
                .getResponse();
        } else {
            return handlerInput.responseBuilder
                .speak(`Vous êtes en début de Liste! Il n'y a pas de morceau précédent!`)
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

        return request.type === 'IntentRequest' &&
            request.intent.name === 'ForwardIntent';
    },
    async handle(handlerInput) {
        const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
        const offset = AudioPlayer.offsetInMilliseconds;
        const podcast = getPodcast(AudioPlayer, podcasts);
        const delay = Number(handlerInput.requestEnvelope.request.intent.slots.Delay_up.value)
        return handlerInput.responseBuilder
            .speak(`J'avance de ${delay} secondes`) // à supprimer en prod
            .addAudioPlayerPlayDirective('REPLACE_ALL', podcast.url, podcast.id, offset + (delay * 1000), null)
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

        return request.type === 'IntentRequest' &&
            request.intent.name === 'BackwardIntent';
    },
    async handle(handlerInput) {
        const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
        const offset = AudioPlayer.offsetInMilliseconds;
        const podcast = getPodcast(AudioPlayer, podcasts);
        const delay = Number(handlerInput.requestEnvelope.request.intent.slots.Delay_down.value)
        return handlerInput.responseBuilder
            .speak(`Je recule de ${delay} secondes`) // à supprimer en prod
            .addAudioPlayerPlayDirective('REPLACE_ALL', podcast.url, podcast.id, offset - (delay * 1000), null)
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

        return request.type === 'AudioPlayer.PlaybackStarted' ||
            request.type === 'AudioPlayer.PlaybackStopped' ||
            request.type === 'AudioPlayer.PlaybackNearlyFinished' ||
            request.type === 'AudioPlayer.PlaybackFailed';
    },
    async handle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
        const offset = AudioPlayer.offsetInMilliseconds;
        const token = getGithubToken(handlerInput);
        const i = searchPodcast(AudioPlayer, podcasts)
        var podcast = podcasts[i]

        switch (request.type) {

            case 'AudioPlayer.PlaybackStarted':

                return handlerInput.responseBuilder
                    .addAudioPlayerPlayDirective('REPLACE_ALL', podcast.url, podcast.id, offset, null)
                    .withSimpleCard(podcast.name, podcast.synopsis)
                    .getResponse();

            case 'AudioPlayer.PlaybackFinished':
                return handlerInput.responseBuilder
                    .getResponse();

            case 'AudioPlayer.PlaybackStopped':
                podcasts[i].offset = offset;
                podcasts[i].state = "in_read";
                podcasts[i].lastopen = handlerInput.requestEnvelope.request.timestamp;
                UpdatePodcasts(podcasts, gist.url, token);
                return handlerInput.responseBuilder
                    .addAudioPlayerStopDirective()
                    .speak(`Lecture en pause`) // à supprimer en prod
                    .withSimpleCard(podcast.name, 'Pause')
                    .getResponse();

            case 'AudioPlayer.PlaybackNearlyFinished':
                const offset = 0;
                const i = searchPodcast(AudioPlayer, podcasts)
                podcast = podcasts[i]
                podcasts[i].offset = offset;
                podcasts[i].state = "read";
                UpdatePodcasts(podcasts, gist.url, token);
                if (podcasts[i + 1] !== null) {
                    const nextpodcast = podcasts[i + 1]
                    return handlerInput.responseBuilder
                        .addAudioPlayerPlayDirective('ENQUEUE', nextpodcast.url, nextpodcast.token, nextpodcast.offset, podcasts[i - 1].token)
                        .getResponse();
                } else {
                    return handlerInput.responseBuilder
                        .speak(`Il n'y a plus de podcast à lire. Bonne nuit et à demain!`)
                        .withShouldEndSession(true)
                        .getResponse();
                }

            case 'AudioPlayer.PlaybackFailed':
                console.error('Playback Failed');
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
        console.error(`Error handled: ${error.message}`);

        return handlerInput.responseBuilder
            .speak(`Oh non ! La skill a eu un problème. Réessayer plus tard !`)
            .getResponse();
    }
};

// ----------------------------------------------------------------------------------------------------------------
// HelpHandler : Handling error send console log and speak error message
// ----------------------------------------------------------------------------------------------------------------
const HelpHandler = {
    canHandle(handlerInput) {

        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.HelpIntent';
    },
    async handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak(`Vous pouvez jouer le podcast de votre choix de la liste de vos podcasts préalablement téléchargé via le site web. ` +
                `Pour cela, dites Alexa joue le titre, suivi du numéro de podcast dans l'ordre de votre liste. ` +
                `Vous pouvez mettre en pause un podcast en cours de lecture. Pour cela dites pause ou stop. ` +
                `Il vous suffira de dire simplement : Alexa reprend,  pour reprendre la lecture du dernier podcast en pause. ` +
                `Vous pouvez avancer de quelques secondes en avant ou en arrière. ` +
                `Pour cela, vous pouvez dire : Alexa avance de 30, pour avancer de 30 secondes la lecture du podcast, ou bien Alexa recule de 40, pour reculer la lecture de 40 secondes. ` +
                `Vous pouvez dire : Alexa suivant, pour passer au podcast suivant, ou bien : Alexa précédent pour jouer le podcast précédent. ` +
                `Enfin vous pouvez demander le synopsis du podcast en disant simplement Alexa résumé ou Alexa synopsis.`)
            .withSimpleCard('MyPodcast', `Aide : `)
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

        return request.type === 'IntentRequest' &&
            request.intent.name === 'LastIntent';
    },
    async handle(handlerInput) {
        var gist = await getGist(getGithubToken(handlerInput));
        const i = searchLastPodcast(podcasts)
        return handlerInput.responseBuilder
            .speak(`Le dernier podcast joué était le titre ${i+1} : ${podcasts[i].name}`)
            .withSimpleCard('Dernier Podcast', `Titre ${i+1} :  ${podcasts[i].name}`)
            .getResponse();
    },
};



// ----------------------------------------------------------------------------------------------------------------
// Intent ListHandler : give the podcasts list
// ---------------------------------------------------------------------------------------------------------------- 
const ListHandler = {
    canHandle(handlerInput) {

        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' &&
            request.intent.name === 'ListIntent';
    },
    async handle(handlerInput) {
        var gist = await getGist(getGithubToken(handlerInput));
        let names = "";
        let state = "";
        let number = 0;
        podcasts.map(podcast => {
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
            .speak(`Voici la liste des ${number} podcasts disponibles : ${names}. Quel titre voulez vous jouer ?`)
            .reprompt(`Quel morceau voulez vous jouer ?`)
            .getResponse();
    }
};

// ----------------------------------------------------------------------------------------------------------------
// Intent StartAtOffsetHandler : playing forward with delay in s
// ---------------------------------------------------------------------------------------------------------------- 
const StartAtOffsetHandler = {
    canHandle(handlerInput) {

        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' &&
            request.intent.name === 'StartAtOffsetIntent';
    },
    async handle(handlerInput) {
        const AudioPlayer = handlerInput.requestEnvelope.context.AudioPlayer;
        var gist = await getGist(getGithubToken(handlerInput));
        const podcast = getPodcast(AudioPlayer, podcasts);
        const offset = Number(handlerInput.requestEnvelope.request.intent.slots.Offset.value);
        return handlerInput.responseBuilder
            .speak(`ok je commence à partir de ${offset} secondes`) // à supprimer en prod
            .addAudioPlayerPlayDirective('REPLACE_ALL', podcast.url, podcast.id, offset * 1000, null)
            .withSimpleCard(podcast.name, `Lecture à ${offset}s >>>`)
            .getResponse();
    },
};

// ----------------------------------------------------------------------------------------------------------------
// CheckAccountLinkedHandler : Check if the git account needed for storing the podcasts list in a gist is linked
// ----------------------------------------------------------------------------------------------------------------
const CheckAccountLinkedHandler = {
    canHandle(handlerInput) {
        // If accessToken does not exist (ie, account is not linked),
        // then return true, which triggers the "need to link" card.
        // This should not be used unless the skill cannot function without
        // a linked account.  If there's some functionality which is available without
        // linking an account, do this check "just-in-time"
        return isAccountLinked(handlerInput);
    },
    handle(handlerInput) {
        const speakOutput = `My Podcast nécéssite la connexion a votre compte github, j'envoie les informations de connexion sur votre application Alexa.`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .withLinkAccountCard()
            .getResponse();
    },
};

// ----------------------------------------------------------------------------------------------------------------
// CheckGist : Check if the gits is created or not
// ----------------------------------------------------------------------------------------------------------------
const CheckGist = {
    async canHandle(handlerInput) {
        // Get the gist 
        gist = await getGist(getGithubToken(handlerInput));
        return gist ? false : true;
    },
    handle(handlerInput) {
        const speakOutput = `My Podcast nécéssite la création d'une liste de podcast pour cela ouvrez l'application web mypodcast vercel`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    },
};

// ----------------------------------------------------------------------------------------------------------------
// CheckPodcasts: Check if there is at least one podcast in the list
// ----------------------------------------------------------------------------------------------------------------
const CheckPodcasts = {
    async canHandle(handlerInput) {
        // Get the gist 
        podcasts = await getPodcasts(gist.raw_url);
        return podcasts.length ? false : true;
    },
    handle(handlerInput) {
        const speakOutput = `My Podcast nécéssite au moins un podcast pour fonctionner, pour cela ouvrez l'application web mypodcast vercel`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    },
};

// ----------------------------------------------------------------------------------------------------------------
// CheckAccountPermissionHandler : Check if permissions on first name reading are autorised on alexa app
// ----------------------------------------------------------------------------------------------------------------
const CheckAccountPermissionHandler = {
    canHandle(handlerInput) {
        // If we can update Username, we have PERMISSIONS instead we request PERMISSIONS.
        return isPermission(handlerInput);
    },
    handle(handlerInput) {
        const PERMISSIONS = ['alexa::profile:given_name:read'];
        const speakOutput = "My Podcast nécéssite l'accès a certaines de vos informations personnelles comme votre prénom, j'envoie la procédure d'autorisation nécéssaires sur votre application Alexa.";
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
            return podcasts[i]
        }
    }
}

// ----------------------------------------------------------------------------------------------------------------
// searchPodcast(AudioPlayer,podcasts) : return the podcast number played actually by the Audioplayer
// ----------------------------------------------------------------------------------------------------------------
function searchPodcast(AudioPlayer, podcasts) {
    for (let i in podcasts) {
        if (AudioPlayer.token === podcasts[i].id) {
            return i
        }
    }
}


// ----------------------------------------------------------------------------------------------------------------
// searchLastPodcast(AudioPlayer,podcasts) : return the Last podcast played 
// ----------------------------------------------------------------------------------------------------------------
function searchLastPodcast(podcasts) {
    let sec = 31536000000;
    let j = "";
    for (let i in podcasts) {
        if ((podcasts[i].timestamp > 0) && (Math.floor(podcasts[i].timestamp) - Math.floor(Date.now()) < sec)) {
            sec = Math.floor(podcasts[i].timestamp) - Math.floor(Date.now())
            j = i;
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
    let gists = await axios.get('https://api.github.com/gists', {
        params: {
            per_page: 5,
        },
        headers: {
            Authorization: `token ${token}`,
            "User-Agent": "Alexa-App",
        },
    });
    gists = gists.data
    for (let i in gists) {
        if (gists[i].description === "MyPodcast") {
            //console.log(gists[i])
            return {
                id: gists[i].id,
                url: gists[i].url,
                raw_url: gists[i].files["podcasts.json"].raw_url
            }
        }
    }
}

// ----------------------------------------------------------------------------------------------------------------
// UpdatePodcasts(podcasts) : update the podcasts list with a gist.raw_url and the gist token
// ----------------------------------------------------------------------------------------------------------------
async function UpdatePodcasts(podcasts, raw_url, token) {
    await axios({
            method: 'post',
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
        .then(function(reponse) {
            //On traite la suite une fois la réponse obtenue 
            //console.log(reponse);
        })
        .catch(function(erreur) {
            //On traite ici les erreurs éventuellement survenues
            console.error(erreur);
        });
}

// ----------------------------------------------------------------------------------------------------------------
// getGithubToken(handlerInput) : return Github token
// ---------------------------------------------------------------------------------------------------------------- 
function getGithubToken(handlerInput) {
    return handlerInput.requestEnvelope.session.user.accessToken
}

// ----------------------------------------------------------------------------------------------------------------
// isAccountLinked(handlerInput) : return boolean if Github account is linked or not 
// ---------------------------------------------------------------------------------------------------------------- 
function isAccountLinked(handlerInput) {
    // if there is an access token, then assumed linked
    return (handlerInput.requestEnvelope.session.user.accessToken === undefined);
}

// ----------------------------------------------------------------------------------------------------------------
// isPermission(handlerInput): return boolean if permission to get profile given name is given or not
// ---------------------------------------------------------------------------------------------------------------- 
async function isPermission(handlerInput) {
    const { responseBuilder, serviceClientFactory } = handlerInput;
    try {
        const upsServiceClient = serviceClientFactory.getUpsServiceClient();
        username = await upsServiceClient.getProfileGivenName();
        return (false)
    } catch (error) {
        return (true);
    }
}

// ****************************************************************************************************************
// Skill Builders
// ****************************************************************************************************************
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        CheckAccountLinkedHandler,
        CheckAccountPermissionHandler,
        CheckGist,
        CheckPodcasts,
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
        AudioPlayerEventHandler,
        SynopsisHandler,
        HelpHandler,
        LastHandler,
        ListHandler,
        StartAtOffsetHandler,
        TitleHandler)
    .addErrorHandlers(ErrorHandler)
    .withApiClient(new Alexa.DefaultApiClient())
    .lambda();